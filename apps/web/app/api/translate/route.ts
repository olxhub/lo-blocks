// src/app/api/translate/route.ts
//
// HTTP endpoint for content translation. Thin wrapper around the translation
// module — handles request parsing, content-store lookups, dedup, and response
// formatting. The actual translation logic lives in @/lib/translate/.

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { syncContentFromStorage, getSourceFile, getBlocksForFiles, getBlockVariant, getOriginalVariant } from '@/lib/content/syncContentFromStorage';
import { getProvider } from '@/lib/llm/provider';
import { translateContent } from '@/lib/translate';
import type { DefinitionKey, ContentVariant, LofsRef, OlxRelativePath, SafeRelativePath } from '@/lib/types';

import { toDefinitionKey } from '@/lib/types/id';
import { toContentVariant } from '@/lib/types/i18n';

const contentDir = process.env.OLX_CONTENT_DIR || './content';
const logsDir = path.resolve(contentDir, '..', 'logs');
const provider = new FileStorageProvider(contentDir, 'content');

const inFlightTranslations = new Map<string, Promise<any>>();
const TRANSLATION_TIMEOUT_MS = 600_000; // 10 minutes

type TranslationResult = { ok: boolean; idMap?: any; error?: string };

// =============================================================================
// Content-store helpers (depend on syncContentFromStorage state)
// =============================================================================

function uriToRelPath(fileUri: LofsRef): OlxRelativePath {
  return provider.toRelativePath(fileUri) as OlxRelativePath;
}

function computeTranslationPath(sourceRelPath: OlxRelativePath, targetLocale: ContentVariant): OlxRelativePath {
  const ext = path.extname(sourceRelPath);
  const base = sourceRelPath.slice(0, -ext.length);
  return `${base}/${targetLocale}.auto${ext}` as OlxRelativePath;
}

/** Follow source_file back to the human-authored original to avoid
 *  quality degradation from translating translations. */
function resolveOriginalSource(
  sourceFileUri: LofsRef, blockId: DefinitionKey, sourceLocale: ContentVariant
): { fileUri: LofsRef; locale: ContentVariant } {
  const sourceVariant = getBlockVariant(blockId, sourceLocale);
  if (sourceVariant?.generated?.method !== 'machineTranslated' || !sourceVariant?.generated?.source_file) {
    return { fileUri: sourceFileUri, locale: sourceLocale };
  }
  const originalFileName = sourceVariant.generated.source_file;
  const sourceRelPath = uriToRelPath(sourceFileUri);
  const originalRelPath = path.join(path.dirname(path.dirname(sourceRelPath)), originalFileName) as OlxRelativePath;

  const original = getOriginalVariant(blockId);
  const effectiveLocale = original?.lang ? toContentVariant(original.lang) : sourceLocale;

  return { fileUri: provider.toLofsRef(originalRelPath as SafeRelativePath), locale: effectiveLocale };
}

function buildIdMapResult(sourceFileUri: LofsRef, targetRelPath: OlxRelativePath): TranslationResult {
  const targetFileUri = provider.toLofsRef(targetRelPath as SafeRelativePath);
  // Check that the target file was actually indexed — getBlocksForFiles
  // returns source blocks too, so a non-empty result doesn't guarantee
  // the translation was parsed successfully.
  const targetOnly = getBlocksForFiles(targetFileUri);
  if (!targetOnly || Object.keys(targetOnly).length === 0) {
    return { ok: false, error: `Translation was written but failed to index (${targetRelPath})` };
  }
  const idMap = getBlocksForFiles(sourceFileUri, targetFileUri);
  return { ok: true, idMap };
}

async function checkExistingTranslation(
  targetRelPath: OlxRelativePath,
  sourceFileUri: LofsRef
): Promise<TranslationResult | null> {
  try {
    await provider.read(targetRelPath);
  } catch {
    return null;
  }
  await syncContentFromStorage(provider);
  return buildIdMapResult(sourceFileUri, targetRelPath);
}

// =============================================================================
// Translation orchestration
// =============================================================================

async function doTranslation(
  blockId: DefinitionKey,
  sourceFileUri: LofsRef,
  targetLocale: ContentVariant,
  sourceLocale: ContentVariant
): Promise<TranslationResult> {
  const { fileUri: effectiveFileUri, locale: effectiveSourceLocale } =
    resolveOriginalSource(sourceFileUri, blockId, sourceLocale);
  const effectiveRelPath = uriToRelPath(effectiveFileUri);

  let sourceContent: string;
  try {
    sourceContent = (await provider.read(effectiveRelPath)).content;
  } catch (err: any) {
    return { ok: false, error: `Failed to read source file "${effectiveRelPath}": ${err.message}` };
  }

  const targetRelPath = computeTranslationPath(effectiveRelPath, targetLocale);
  const existing = await checkExistingTranslation(targetRelPath, sourceFileUri);
  if (existing) return existing;

  const originalVariant = getOriginalVariant(blockId);

  const result = await translateContent({
    sourceContent,
    fileType: 'olx',
    sourceLocale: effectiveSourceLocale,
    targetLocale,
    sourceFileName: path.basename(effectiveRelPath),
    sourceCategory: originalVariant?.category,
    logsDir,
    provider,
    sourceProvenance: [effectiveFileUri],
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Write and sync
  const fullTargetPath = path.resolve(contentDir, targetRelPath);
  await fs.mkdir(path.dirname(fullTargetPath), { recursive: true });
  try {
    await provider.write(targetRelPath, result.content);
  } catch (err: any) {
    return { ok: false, error: `Failed to write translation: ${err.message}` };
  }

  await syncContentFromStorage(provider);
  return buildIdMapResult(sourceFileUri, targetRelPath);
}

// =============================================================================
// Route handler
// =============================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.blockId || !body.targetLocale) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: blockId, targetLocale' },
        { status: 400 }
      );
    }

    let targetLocale: ContentVariant;
    try {
      targetLocale = toContentVariant(body.targetLocale);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid locale format' },
        { status: 400 }
      );
    }
    if (targetLocale === '*') {
      return NextResponse.json(
        { ok: false, error: 'Cannot translate to wildcard locale "*" — specify a concrete target language' },
        { status: 400 }
      );
    }

    const blockId = toDefinitionKey(body.blockId);

    if (getProvider().provider === 'stub') {
      return NextResponse.json(
        { ok: false, error: 'LLM is in stub mode — no real translation available' }
      );
    }

    await syncContentFromStorage(provider);

    // Server determines source: find the human-authored original variant.
    // The client just says "I want block X in language Y" — the server
    // finds what to translate from, avoiding translation-of-translations.
    const originalVariant = getOriginalVariant(blockId);
    if (!originalVariant) {
      return NextResponse.json(
        { ok: false, error: `Block "${blockId}" not found` },
        { status: 404 }
      );
    }

    // HACK: Should not be hardcoded to English
    const sourceLocale = toContentVariant(originalVariant.lang || 'en');
    const sourceFileUri = getSourceFile(blockId, sourceLocale);
    if (!sourceFileUri) {
      return NextResponse.json(
        { ok: false, error: `Source file not found for block "${blockId}" locale "${sourceLocale}"` },
        { status: 404 }
      );
    }

    // Dedup: if same file+locale is already in flight, await that instead
    const dedupeKey = `${sourceFileUri}::${targetLocale}`;
    if (inFlightTranslations.has(dedupeKey)) {
      const result = await inFlightTranslations.get(dedupeKey);
      return NextResponse.json(result, result.ok ? undefined : { status: 500 });
    }

    const promise = doTranslation(blockId, sourceFileUri, targetLocale, sourceLocale);
    const timedPromise = Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Translation timed out')), TRANSLATION_TIMEOUT_MS)
      ),
    ]);
    inFlightTranslations.set(dedupeKey, timedPromise);

    try {
      const result = await timedPromise;
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
