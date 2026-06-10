// apps/server/src/routes/translate.ts
//
// POST /api/translate — content translation endpoint (Hono).
//
// Thin HTTP wrapper: parses and validates the request, deduplicates
// in-flight translations, delegates to the shared orchestration module,
// and formats the response.
//
// Migrated from apps/web/app/api/translate/route.ts (Next.js API route).
// The Next.js version hit "Config not initialized" because the Next.js
// process never called initConfig(). Running here in the Hono server,
// config is initialized at startup.

import path from 'path';
import type { Context } from 'hono';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import {
  syncContentFromStorage,
  getSourceFile,
  getOriginalVariant,
} from '@/lib/content/syncContentFromStorage';
import { resolveLLMConfigWithFallback } from '@/lib/llm/profiles';
import { translateBlock } from '@/lib/translate/orchestrate';
import type { ContentVariant } from '@/lib/types';
import { validateDefinitionKey, parseDefinitionKey } from '@/lib/types/id-grammar';
import { toContentVariant } from '@/lib/types/i18n';

const contentDir = process.env.OLX_CONTENT_DIR || './content';
const logsDir = path.resolve(contentDir, '..', 'logs');
const provider = new FileStorageProvider(contentDir, 'content');

const inFlightTranslations = new Map<string, Promise<any>>();
const TRANSLATION_TIMEOUT_MS = 600_000; // 10 minutes

export async function handleTranslate(c: Context): Promise<Response> {
  try {
    const body = await c.req.json();

    if (!body.blockId || !body.targetLocale) {
      return c.json(
        { ok: false, error: 'Missing required fields: blockId, targetLocale' },
        400,
      );
    }

    let targetLocale: ContentVariant;
    try {
      targetLocale = toContentVariant(body.targetLocale);
    } catch {
      return c.json({ ok: false, error: 'Invalid locale format' }, 400);
    }
    if (targetLocale === '*') {
      return c.json(
        { ok: false, error: 'Cannot translate to wildcard locale "*" — specify a concrete target language' },
        400,
      );
    }

    // Clients send namespace-qualified keys (they come from idMap keys).
    const blockIdValid = validateDefinitionKey(String(body.blockId));
    if (blockIdValid !== true) {
      return c.json(
        { ok: false, error: `blockId must be a namespace-qualified DefinitionKey: ${blockIdValid}` },
        400,
      );
    }
    const blockId = parseDefinitionKey(body.blockId);

    const llmConfig = resolveLLMConfigWithFallback('translation');
    if (llmConfig.provider === 'stub') {
      return c.json(
        { ok: false, error: 'LLM is in stub mode — no real translation available' },
        503,
      );
    }

    await syncContentFromStorage(provider);

    const originalVariant = getOriginalVariant(blockId);
    if (!originalVariant) {
      return c.json({ ok: false, error: `Block "${blockId}" not found` }, 404);
    }

    // HACK: Should not be hardcoded to English
    const sourceLocale = toContentVariant(originalVariant.lang || 'en');
    const sourceFileUri = getSourceFile(blockId, sourceLocale);
    if (!sourceFileUri) {
      return c.json(
        { ok: false, error: `Source file not found for block "${blockId}" locale "${sourceLocale}"` },
        404,
      );
    }

    // Dedup: if same file+locale is already in flight, await that instead
    const dedupeKey = `${sourceFileUri}::${targetLocale}`;
    if (inFlightTranslations.has(dedupeKey)) {
      const result = await inFlightTranslations.get(dedupeKey);
      return c.json(result, result.ok ? undefined : 500);
    }

    const promise = translateBlock({
      provider, logsDir,
      blockId, sourceFileUri, targetLocale, sourceLocale,
    });
    let timer: ReturnType<typeof setTimeout>;
    const timedPromise = Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Translation timed out')), TRANSLATION_TIMEOUT_MS);
      }),
    ]);
    inFlightTranslations.set(dedupeKey, timedPromise);

    try {
      const result = await timedPromise;
      if (!result.ok) {
        return c.json(result, 500);
      }
      return c.json(result);
    } finally {
      clearTimeout(timer!);
      inFlightTranslations.delete(dedupeKey);
    }
  } catch (error: any) {
    console.error('[/api/translate] Error:', error);
    return c.json(
      { ok: false, error: error.message || 'Unknown error' },
      500,
    );
  }
}
