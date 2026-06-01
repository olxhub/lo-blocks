// lib/translate/orchestrate.ts
//
// Translation orchestration: the layer between "I have a blockId and
// targetLocale" and the core translateContent() call.
//
// Handles: resolving the human-authored original (avoiding
// translation-of-translations), computing output paths, checking for
// existing translations, writing results, and syncing the content store.
//
// Used by both the Hono route handler and the Next.js route (during
// migration). The CLI script (scripts/translate.ts) uses computeTranslationPath
// for output path convention.

import path from 'path';
import fs from 'fs/promises';
import {
  syncContentFromStorage,
  getSourceFile,
  getBlocksForFiles,
  getBlockVariant,
  getOriginalVariant,
} from '@/lib/content/syncContentFromStorage';
import { translateContent } from '@/lib/translate';
import type { StorageProvider } from '@/lib/types/storage';
import type {
  DefinitionKey,
  ContentVariant,
  LofsRef,
  OlxRelativePath,
  SafeRelativePath,
} from '@/lib/types';
import { toContentVariant } from '@/lib/types/i18n';

export type TranslationResult = { ok: boolean; idMap?: any; error?: string };

// =============================================================================
// Path convention
// =============================================================================

/**
 * Compute the output path for a translation file.
 *
 * Convention: `<source-basename>/<locale>.auto.<ext>`
 * e.g., `mult.olx` → `mult/pl.auto.olx`
 */
export function computeTranslationPath(
  sourceRelPath: OlxRelativePath,
  targetLocale: ContentVariant,
): OlxRelativePath {
  const ext = path.extname(sourceRelPath);
  const base = sourceRelPath.slice(0, -ext.length);
  return `${base}/${targetLocale}.auto${ext}` as OlxRelativePath;
}

// =============================================================================
// Content-store helpers
// =============================================================================

/** Follow source_file back to the human-authored original to avoid
 *  quality degradation from translating translations. */
function resolveOriginalSource(
  provider: StorageProvider,
  sourceFileUri: LofsRef,
  blockId: DefinitionKey,
  sourceLocale: ContentVariant,
): { fileUri: LofsRef; locale: ContentVariant } {
  const sourceVariant = getBlockVariant(blockId, sourceLocale);
  if (
    sourceVariant?.generated?.method !== 'machineTranslated' ||
    !sourceVariant?.generated?.source_file
  ) {
    return { fileUri: sourceFileUri, locale: sourceLocale };
  }
  const originalFileName = sourceVariant.generated.source_file;
  const sourceRelPath = provider.toRelativePath(sourceFileUri);
  const originalRelPath = path.join(
    path.dirname(path.dirname(sourceRelPath)),
    originalFileName,
  ) as OlxRelativePath;

  const original = getOriginalVariant(blockId);
  const effectiveLocale = original?.lang
    ? toContentVariant(original.lang)
    : sourceLocale;

  return {
    fileUri: provider.toLofsRef(originalRelPath as SafeRelativePath),
    locale: effectiveLocale,
  };
}

function buildIdMapResult(
  provider: StorageProvider,
  sourceFileUri: LofsRef,
  targetRelPath: OlxRelativePath,
): TranslationResult {
  const targetFileUri = provider.toLofsRef(targetRelPath as SafeRelativePath);
  // Check that the target file was actually indexed — getBlocksForFiles
  // returns source blocks too, so a non-empty result doesn't guarantee
  // the translation was parsed successfully.
  const targetOnly = getBlocksForFiles(targetFileUri);
  if (!targetOnly || Object.keys(targetOnly).length === 0) {
    return {
      ok: false,
      error: `Translation was written but failed to index (${targetRelPath})`,
    };
  }
  const idMap = getBlocksForFiles(sourceFileUri, targetFileUri);
  return { ok: true, idMap };
}

async function checkExistingTranslation(
  provider: StorageProvider,
  targetRelPath: OlxRelativePath,
  sourceFileUri: LofsRef,
): Promise<TranslationResult | null> {
  try {
    await provider.read(targetRelPath);
  } catch {
    return null;
  }
  await syncContentFromStorage(provider);
  return buildIdMapResult(provider, sourceFileUri, targetRelPath);
}

// =============================================================================
// Main orchestration
// =============================================================================

export interface TranslateBlockOptions {
  provider: StorageProvider;
  contentDir: string;
  logsDir: string;
  blockId: DefinitionKey;
  sourceFileUri: LofsRef;
  targetLocale: ContentVariant;
  sourceLocale: ContentVariant;
}

/**
 * Translate a block's source file to the target locale.
 *
 * Resolves the human-authored original, checks for existing translations,
 * calls the LLM, writes the result, and syncs the content store.
 * Returns an idMap covering the source + translated blocks.
 */
export async function translateBlock(opts: TranslateBlockOptions): Promise<TranslationResult> {
  const { provider, contentDir, logsDir, blockId, sourceFileUri, targetLocale, sourceLocale } = opts;

  const { fileUri: effectiveFileUri, locale: effectiveSourceLocale } =
    resolveOriginalSource(provider, sourceFileUri, blockId, sourceLocale);
  const effectiveRelPath = provider.toRelativePath(effectiveFileUri);

  let sourceContent: string;
  try {
    sourceContent = (await provider.read(effectiveRelPath)).content;
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to read source file "${effectiveRelPath}": ${err.message}`,
    };
  }

  const targetRelPath = computeTranslationPath(effectiveRelPath, targetLocale);
  const existing = await checkExistingTranslation(provider, targetRelPath, sourceFileUri);
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
  return buildIdMapResult(provider, sourceFileUri, targetRelPath);
}
