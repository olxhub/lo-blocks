// src/lib/translate/index.ts
//
// Core translation module. Translates content files (OLX, PEG-based formats)
// via LLM, with continuation on truncation, validation, and retry.
//
// Usable by both the API route handler and the CLI script — no dependency
// on Next.js, the content store, or any specific storage provider.

import path from 'path';
import fs from 'fs/promises';
import { callLLM } from '@/lib/llm/serverCall';
import { buildTranslationMessages } from '@/lib/translate/prompts';
import { validateTranslation } from '@/lib/translate/validate';
import {
  stripCodeFences,
  extractLeadingComments,
  parseMetadataFromComments,
  buildFrontmatter,
  hashContent,
} from '@/lib/translate/metadata';

export type TranslateOptions = {
  sourceContent: string;
  fileType: string;            // 'olx', 'chatpeg', etc.
  sourceLocale: string;
  targetLocale: string;
  sourceFileName: string;      // basename of source file, for provenance
  sourceCategory?: string;     // from content store or source frontmatter
  grammar?: string;            // PEG grammar text for PEG-based formats
  logsDir?: string;            // where to write rejected translations
  provider?: import('@/lib/lofs/types').StorageProvider;  // for resolving src= in OLX validation
  sourceProvenance?: import('@/lib/types').Provenance;   // provenance of source file, for src= resolution
};

export type TranslateResult = {
  ok: true;
  content: string;
} | {
  ok: false;
  error: string;
};

const MAX_CONTINUATIONS = 3;
const MAX_RETRIES = 1;

/** Translate content from one locale to another.
 *
 *  Handles the full pipeline: prompt construction, LLM call with continuation
 *  on truncation, code fence stripping, metadata assembly, validation with
 *  retry, and rejected-output logging.
 *
 *  Returns the fully assembled file content (with frontmatter), ready to write. */
export async function translateContent(options: TranslateOptions): Promise<TranslateResult> {
  const {
    sourceContent, fileType, sourceLocale, targetLocale,
    sourceFileName, sourceCategory, grammar, logsDir, provider, sourceProvenance,
  } = options;

  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Call LLM with continuation loop
    let llmOutput: string;
    try {
      llmOutput = await callLLMWithContinuation(sourceContent, fileType, sourceLocale, targetLocale, grammar);
    } catch (err: any) {
      return { ok: false, error: `LLM translation failed: ${err.message}` };
    }

    // Assemble file with metadata
    const fileContent = await assembleTranslatedFile(
      llmOutput, sourceContent, sourceFileName, targetLocale, sourceCategory
    );

    // Validate
    const validationError = await validateTranslation(fileContent, sourceContent, fileType, `${targetLocale}:${sourceFileName}`, provider, sourceProvenance);
    if (validationError) {
      lastError = validationError;
      console.warn(`[translate] Validation failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${validationError}`);

      // Dump rejected translation for debugging
      if (logsDir) {
        try {
          await fs.mkdir(logsDir, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const baseName = path.basename(sourceFileName, path.extname(sourceFileName));
          const logName = `${baseName}-${targetLocale}-${timestamp}.rejected${path.extname(sourceFileName)}`;
          await fs.writeFile(
            path.join(logsDir, logName),
            `<!-- REJECTED: ${validationError} -->\n${fileContent}`
          );
        } catch { /* best-effort */ }
      }

      if (attempt < MAX_RETRIES) continue;
      return { ok: false, error: `Translation produced invalid output after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}` };
    }

    return { ok: true, content: fileContent };
  }

  return { ok: false, error: `Translation failed: ${lastError}` };
}

/** Call the LLM with automatic continuation when output is truncated. */
async function callLLMWithContinuation(
  sourceContent: string,
  fileType: string,
  sourceLocale: string,
  targetLocale: string,
  grammar?: string
): Promise<string> {
  const messages = buildTranslationMessages(sourceContent, fileType, sourceLocale, targetLocale, grammar);
  let accumulated = '';

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const { text, truncated } = await callLLM('translation', messages);
    accumulated += text;

    if (!truncated) break;

    if (i === MAX_CONTINUATIONS) {
      throw new Error('Translation too long: exceeded maximum continuation attempts');
    }

    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: 'Continue exactly where you left off. Do not repeat any content already produced.' });
  }

  const cleaned = stripCodeFences(accumulated);
  if (!cleaned.trim()) {
    throw new Error('LLM returned empty translation');
  }
  return cleaned;
}

/** Assemble the final translated file: merge LLM-translated metadata with provenance fields. */
async function assembleTranslatedFile(
  llmOutput: string,
  sourceContent: string,
  sourceFileName: string,
  targetLocale: string,
  sourceCategory?: string
): Promise<string> {
  const { comments, body } = extractLeadingComments(llmOutput);
  const llmMeta = parseMetadataFromComments(comments);

  const translatedMeta: Record<string, any> = {
    ...llmMeta,
    ...(sourceCategory && { category: sourceCategory }),
    lang: targetLocale,
    generated: {
      method: 'machineTranslated',
      source_file: sourceFileName,
      source_version: await hashContent(sourceContent),
    },
  };

  const content = `${buildFrontmatter(translatedMeta)}\n${body}`;
  return content.endsWith('\n') ? content : content + '\n';
}

/** Detect file type from extension. */
export function detectFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.olx') return 'olx';
  if (ext.endsWith('peg')) return ext.slice(1); // '.chatpeg' → 'chatpeg'
  return ext.slice(1); // fallback: use extension without dot
}
