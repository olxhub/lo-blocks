// src/app/api/translate/route.ts
//
// Server-side translation endpoint. Receives a block provenance + target locale,
// translates the source OLX file via LLM, saves the translation to LOFS,
// re-syncs content, and returns the updated idMap.
//
// File naming convention:
//   demos/algebra101lesson.olx → demos/algebra101lesson/ar-Arab-SA.olx
//

import { NextResponse } from 'next/server';
import path from 'path';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import {
  getProvider,
  AWS_BEDROCK_MODEL,
  AWS_REGION,
  AZURE_API_KEY,
  AZURE_DEPLOYMENT_ID,
  AZURE_API_VERSION,
  AZURE_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_BASE_URL,
} from '@/lib/llm/provider';
import { getLanguageLabel } from '@/lib/i18n/languages';

const provider = new FileStorageProvider('./content');

// Server-side dedup: concurrent requests for same file+locale await the same promise
const inFlightTranslations = new Map<string, Promise<any>>();

// =============================================================================
// LLM Call (server-side, direct provider call)
// =============================================================================

async function callLLMForTranslation(sourceContent: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
  const { provider: llmProvider, error: llmError } = getProvider();

  if (llmError) {
    throw new Error(`LLM configuration error: ${llmError}`);
  }

  const systemPrompt = `You are a translator for educational content in OLX (XML) format.

Rules:
- Translate ALL human-readable text content (text between tags, attribute values like "title", "label", "placeholder", "description")
- PRESERVE all XML tags, tag names, id attributes, and structural attributes unchanged
- Do NOT translate: id values, ref values, tag names, CSS classes, LaTeX formulas, code blocks
- Output ONLY the translated OLX - no explanations, no markdown fencing, no commentary
- Maintain the exact same XML structure and nesting
- For mathematical content, preserve formulas but translate surrounding text
- Use natural, culturally appropriate phrasing`;

  const userPrompt = `Translate the following OLX content from ${sourceLanguage} to ${targetLanguage}:\n\n${sourceContent}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  switch (llmProvider) {
    case 'stub':
      return stubTranslation(sourceContent, targetLanguage);
    case 'bedrock':
      return bedrockTranslation(messages);
    case 'openai':
      return openaiTranslation(messages);
    case 'azure':
      return azureTranslation(messages);
    default:
      throw new Error(`Unknown LLM provider: ${llmProvider}`);
  }
}

function stubTranslation(sourceContent: string, targetLanguage: string): string {
  // Stub mode: return source content with a comment indicating it's a stub translation
  return `<!-- [STUB TRANSLATION to ${targetLanguage}] -->\n${sourceContent}`;
}

async function bedrockTranslation(messages: Array<{ role: string; content: string }>): Promise<string> {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client = new BedrockRuntimeClient({ region: AWS_REGION });

  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const anthropicMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 8192,
    messages: anthropicMessages,
    ...(system && { system }),
  };

  const command = new InvokeModelCommand({
    modelId: AWS_BEDROCK_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  const textParts = result.content?.filter((c: any) => c.type === 'text') || [];
  return textParts.map((t: any) => t.text).join('');
}

async function openaiTranslation(messages: Array<{ role: string; content: string }>): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OPENAI_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
  }

  const response = await fetch(`${OPENAI_BASE_URL}chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function azureTranslation(messages: Array<{ role: string; content: string }>): Promise<string> {
  const url = `${AZURE_BASE_URL}deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${AZURE_API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': AZURE_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_tokens: 8192 }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Azure API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// =============================================================================
// Translation Pipeline
// =============================================================================

/** Hash content for source_version tracking (server-side version) */
async function hashContent(content: string): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

/** Strip markdown code fences that LLMs sometimes add */
function stripCodeFences(text: string): string {
  let result = text.trim();
  // Strip ```xml ... ``` or ``` ... ```
  if (result.startsWith('```')) {
    const firstNewline = result.indexOf('\n');
    if (firstNewline !== -1) {
      result = result.slice(firstNewline + 1);
    }
    if (result.endsWith('```')) {
      result = result.slice(0, -3).trimEnd();
    }
  }
  return result;
}

/** Compute the target file path for a translation */
function computeTranslationPath(sourceRelPath: string, targetLocale: string): string {
  // demos/algebra101lesson.olx → demos/algebra101lesson/ar-Arab-SA.olx
  const ext = path.extname(sourceRelPath);       // .olx
  const base = sourceRelPath.slice(0, -ext.length); // demos/algebra101lesson
  return `${base}/${targetLocale}${ext}`;
}

/** Build YAML frontmatter for translated file */
function buildFrontmatter(targetLocale: string, sourceFileName: string, sourceVersion: string): string {
  return `<!--
---
lang: ${targetLocale}
autogenerated: true
source_file: ${sourceFileName}
source_version: ${sourceVersion}
---
-->`;
}

/** Strip existing YAML frontmatter comment from OLX content */
function stripFrontmatter(content: string): string {
  // Match <!-- --- ... --- --> at the start
  const frontmatterRe = /^\s*<!--\s*\n---[\s\S]*?---\s*\n\s*-->\s*\n?/;
  return content.replace(frontmatterRe, '').trimStart();
}

async function doTranslation(
  sourceRelPath: string,
  targetLocale: string,
  sourceLocale: string
): Promise<{ ok: boolean; idMap?: any; error?: string }> {
  const fs = await import('fs/promises');

  // 1. Read source file
  let sourceContent: string;
  try {
    const result = await provider.read(sourceRelPath);
    sourceContent = result.content;
  } catch (err: any) {
    return { ok: false, error: `Failed to read source file: ${err.message}` };
  }

  // 2. Check if translation already exists
  const targetRelPath = computeTranslationPath(sourceRelPath, targetLocale);
  try {
    await provider.read(targetRelPath);
    // File exists - re-sync and return (translation already done)
    const { idMap } = await syncContentFromStorage();
    return { ok: true, idMap };
  } catch {
    // File doesn't exist - proceed with translation
  }

  // 3. Call LLM to translate
  const sourceLanguageName = getLanguageLabel(sourceLocale, 'en', 'name');
  const targetLanguageName = getLanguageLabel(targetLocale, 'en', 'name');

  let translatedContent: string;
  try {
    translatedContent = await callLLMForTranslation(sourceContent, sourceLanguageName, targetLanguageName);
    translatedContent = stripCodeFences(translatedContent);
  } catch (err: any) {
    return { ok: false, error: `LLM translation failed: ${err.message}` };
  }

  if (!translatedContent.trim()) {
    return { ok: false, error: 'LLM returned empty translation' };
  }

  // 4. Build translated file with metadata
  const sourceVersion = await hashContent(sourceContent);
  const sourceFileName = path.basename(sourceRelPath);
  const frontmatter = buildFrontmatter(targetLocale, sourceFileName, sourceVersion);
  const strippedTranslation = stripFrontmatter(translatedContent);
  const fileContent = `${frontmatter}\n${strippedTranslation}`;

  // 5. Write translated file (create parent directory first)
  try {
    const fullTargetPath = path.resolve(provider.baseDir, targetRelPath);
    await fs.mkdir(path.dirname(fullTargetPath), { recursive: true });
    await provider.write(targetRelPath, fileContent);
  } catch (err: any) {
    return { ok: false, error: `Failed to write translation: ${err.message}` };
  }

  // 6. Re-sync content to pick up the new file
  const { idMap } = await syncContentFromStorage();

  return { ok: true, idMap };
}

// =============================================================================
// Route Handler
// =============================================================================

export async function POST(request: Request) {
  try {
    const { provenance, targetLocale, sourceLocale } = await request.json();

    if (!provenance || !targetLocale) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: provenance, targetLocale' },
        { status: 400 }
      );
    }

    // Derive source file path from provenance URI
    // "file:///abs/path/content/demos/foo.olx" → "demos/foo.olx"
    let sourceRelPath: string;
    if (provenance.startsWith('file://')) {
      const absPath = provenance.slice(7);
      sourceRelPath = path.relative(provider.baseDir, absPath);
      if (sourceRelPath.startsWith('..')) {
        return NextResponse.json(
          { ok: false, error: 'Provenance file outside content directory' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { ok: false, error: `Unsupported provenance format: ${provenance}` },
        { status: 400 }
      );
    }

    // Dedup: if same file+locale is already in flight, await that instead
    const dedupeKey = `${sourceRelPath}::${targetLocale}`;
    if (inFlightTranslations.has(dedupeKey)) {
      const result = await inFlightTranslations.get(dedupeKey);
      return NextResponse.json(result);
    }

    const promise = doTranslation(sourceRelPath, targetLocale, sourceLocale || '*');
    inFlightTranslations.set(dedupeKey, promise);

    try {
      const result = await promise;
      if (!result.ok) {
        return NextResponse.json(result, { status: 500 });
      }
      return NextResponse.json(result);
    } finally {
      inFlightTranslations.delete(dedupeKey);
    }
  } catch (error: any) {
    console.error('[/api/translate] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
