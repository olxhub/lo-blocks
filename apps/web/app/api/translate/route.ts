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
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { syncContentFromStorage, getSourceFile, getOriginalVariant } from '@/lib/content/syncContentFromStorage';
import { resolveLLMConfigWithFallback } from '@/lib/llm/profiles';
import { translateBlock } from '@/lib/translate/orchestrate';
import type { ContentVariant } from '@/lib/types';
import { definitionKeyForRef, parseDefinitionRef, PLACEHOLDER_NS } from '@/lib/types/id-grammar';
import { toContentVariant } from '@/lib/types/i18n';

const contentDir = process.env.OLX_CONTENT_DIR || './content';
const logsDir = path.resolve(contentDir, '..', 'logs');
const provider = new FileStorageProvider(contentDir, 'content');

const inFlightTranslations = new Map<string, Promise<any>>();
const TRANSLATION_TIMEOUT_MS = 600_000; // 10 minutes

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

    const blockId = definitionKeyForRef(parseDefinitionRef(body.blockId), PLACEHOLDER_NS);

    const llmConfig = resolveLLMConfigWithFallback('translation');
    if (llmConfig.provider === 'stub') {
      return NextResponse.json(
        { ok: false, error: 'LLM is in stub mode — no real translation available' },
        { status: 503 }
      );
    }

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

    // Dedup: if same file+locale is already in flight, await that instead
    const dedupeKey = `${sourceFileUri}::${targetLocale}`;
    if (inFlightTranslations.has(dedupeKey)) {
      const result = await inFlightTranslations.get(dedupeKey);
      return NextResponse.json(result, result.ok ? undefined : { status: 500 });
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
        return NextResponse.json(result, { status: 500 });
      }
      return NextResponse.json(result);
    } finally {
      clearTimeout(timer!);
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
