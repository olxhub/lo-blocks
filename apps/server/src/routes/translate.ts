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
import { writableSourceProvider, ReadOnlySourceError } from '@/lib/lofs/contentSources';
import { source as lofsSource } from '@/lib/types/address';
import {
  syncContentFromStorage,
  getSourceFile,
  getOriginalVariant,
} from '@/lib/content/syncContentFromStorage';
import { resolveLLMConfigWithFallback } from '@/lib/llm/profiles';
import { runTranslation } from '@/lib/translate/runTranslation';
import type { ContentVariant } from '@/lib/types';
import { validateDefinitionKey, parseDefinitionKey } from '@/lib/types/id-grammar';
import { toContentVariant } from '@/lib/types/i18n';

// Rejected-translation debug dumps (cwd-relative).
// TODO(content-in-git): give logs a deliberate, configurable home.
const logsDir = path.resolve('logs');

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

    // Sync across the default content union so the block can be located
    // regardless of which source defines it (getOriginalVariant/getSourceFile
    // read the resulting module snapshot).
    await syncContentFromStorage();

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

    // Write to the source's own provider, resolved from the file's origin — the
    // union has no single write target (writes are always per-source).
    const writeProvider = await writableSourceProvider(lofsSource(sourceFileUri));

    // Dedupe concurrent identical requests + enforce a timeout (shared helper).
    const result = await runTranslation({
      provider: writeProvider, logsDir,
      blockId, sourceFileUri, targetLocale, sourceLocale,
    });
    return c.json(result, result.ok ? undefined : 500);
  } catch (error: any) {
    // Denied, not broken: translating content from a read-only source is an
    // authorization failure — 403, matching /api/file's mapping.
    if (error instanceof ReadOnlySourceError || error.name === 'ReadOnlySourceError') {
      return c.json({ ok: false, error: error.message }, 403);
    }
    console.error('[/api/translate] Error:', error);
    return c.json(
      { ok: false, error: error.message || 'Unknown error' },
      500,
    );
  }
}
