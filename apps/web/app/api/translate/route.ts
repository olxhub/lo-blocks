// apps/web/app/api/translate/route.ts
//
// HTTP endpoint for content translation (Next.js API route).
//
// NOTE: This route is superseded by the Hono handler in
// apps/server/src/routes/translate.ts. It remains during the migration
// but is only reachable via the proxy fallback if the Hono server isn't
// running. Remove once Next.js is eliminated.
//
// Thin HTTP wrapper: parses the request, deduplicates in-flight
// translations, delegates to the shared orchestration module.

import { NextResponse } from 'next/server';
import path from 'path';
import { unionProvider, writableSourceProvider } from '@/lib/lofs/contentSources';
import { source as lofsSource } from '@/lib/types/address';
import { syncContentFromStorage, getSourceFile, getOriginalVariant } from '@/lib/content/syncContentFromStorage';
import { resolveLLMConfigWithFallback } from '@/lib/llm/profiles';
import { runTranslation } from '@/lib/translate/runTranslation';
import type { ContentVariant } from '@/lib/types';
import { validateDefinitionKey, parseDefinitionKey } from '@/lib/types/id-grammar';
import { toContentVariant } from '@/lib/types/i18n';

// Rejected-translation debug dumps (cwd-relative).
// TODO(content-in-git): give logs a deliberate, configurable home.
const logsDir = path.resolve('logs');

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

    // Clients send namespace-qualified keys (they come from idMap keys).
    const blockIdValid = validateDefinitionKey(String(body.blockId));
    if (blockIdValid !== true) {
      return NextResponse.json(
        { ok: false, error: `blockId must be a namespace-qualified DefinitionKey: ${blockIdValid}` },
        { status: 400 }
      );
    }
    const blockId = parseDefinitionKey(body.blockId);

    const llmConfig = resolveLLMConfigWithFallback('translation');
    if (llmConfig.provider === 'stub') {
      return NextResponse.json(
        { ok: false, error: 'LLM is in stub mode — no real translation available' },
        { status: 503 }
      );
    }

    const provider = await unionProvider();
    await syncContentFromStorage(provider);

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

    // Write to the source's own provider — NOT the union (StackedStorageProvider
    // writes to providers[0], which may be a different repo entirely).
    const writeProvider = await writableSourceProvider(lofsSource(sourceFileUri));

    // Dedupe concurrent identical requests + enforce a timeout (shared helper).
    const result = await runTranslation({
      provider: writeProvider, logsDir,
      blockId, sourceFileUri, targetLocale, sourceLocale,
    });
    return NextResponse.json(result, result.ok ? undefined : { status: 500 });
  } catch (error: any) {
    console.error('[/api/translate] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
