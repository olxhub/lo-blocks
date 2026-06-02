// src/lib/i18n/useTranslation.ts
//
// Client-side hook for reactive translanguaging.
//
// Detects language mismatches between user locale and displayed content,
// and provides opt-in translation via requestTranslation(). Translation
// is NOT automatic — the UI shows a "Translate" button and the user
// decides when to trigger it.
//
// Translation state lives in olxjson's per-variant status (variantStatus),
// not in a separate Redux slice. A translation is just loading a new variant.
//
// Null olxJson: During loading, olxJson is null. Hooks must be called
// unconditionally (React rules), so we guard at the top and return
// NO_TRANSLATION. This is not an error — it's the normal loading state.
//
'use client';

import { useSelector } from 'react-redux';
import { useRef } from 'react';
import { scoreBCP47Match } from '@/lib/i18n/getBestVariant';
import { getConfigBool } from '@/lib/config';
import {
  selectBlockState,
  dispatchOlxJson,
  dispatchOlxJsonTranslating,
  dispatchOlxJsonError,
} from '@/lib/state/olxjson';
import type { OlxJson, UserLocale, ContentVariant } from '@/lib/types';
import type { LogEventFn } from '@/lib/render';

export interface TranslationState {
  /** True when showing content in a different language than the user requested */
  isFallback: boolean;
  /** True if a translation is currently in flight */
  translating: boolean;
  /** True if translation was attempted and failed */
  translationFailed: boolean;
  /** Error message from failed translation, or null */
  translationError: string | null;
  /** The locale of the content being shown as fallback, or null if exact match */
  fallbackLocale: ContentVariant | null;
  /** The locale being translated to, or null if no translation needed */
  targetLocale: UserLocale | null;
  /** Callback to explicitly request translation. Null when translation not applicable. */
  requestTranslation: (() => void) | null;
}

const NO_TRANSLATION: TranslationState = {
  isFallback: false,
  translating: false,
  translationFailed: false,
  translationError: null,
  fallbackLocale: null,
  targetLocale: null,
  requestTranslation: null,
};

// Server-side translation timeout is 600s. Client should be generous — LLM
// translation of large files can legitimately take minutes.
const TRANSLATION_FETCH_TIMEOUT_MS = 660_000;

/**
 * Is this a language mismatch that needs translation?
 *
 * Disabled globally: if PMSS 'translanguaging' is false, never translate.
 * Per-block opt-out: translatable="false" on an OLX element skips translation.
 * lang='*' or undefined = language-agnostic content, never a fallback.
 * score >= 1 = same language family, acceptable match.
 * score < 1 = completely different language, needs translation.
 */
function needsTranslation(
  userLocale: UserLocale,
  contentLang: ContentVariant | undefined,
  translatable?: boolean,
): boolean {
  // TODO: Remove try/catch once Next.js is fully eliminated. The Next.js
  // process never calls initConfig(), so getConfigBool throws there.
  try {
    if (!getConfigBool('translanguaging')) return false;
  } catch (err: any) {
    if (err?.message?.includes('Config not initialized')) return false;
    throw err;
  }
  if (translatable === false) return false;
  if (!contentLang || contentLang === '*') return false;
  return scoreBCP47Match(userLocale, contentLang) < 1;
}

// =============================================================================
// ensureTranslation — non-hook fetch trigger
// =============================================================================

interface EnsureTranslationProps {
  runtime: {
    store: any;
    locale: { code: UserLocale };
    sideEffectFree: boolean;
    logEvent: LogEventFn;
  };
}

/**
 * Ensure a translation is in flight for the given block + locale.
 *
 * The client only specifies blockId and targetLocale. The server owns
 * source language selection — it finds the original human-authored
 * content and translates from that, avoiding translation-of-translations.
 *
 * Dedup via olxjson's variantStatus in Redux: if the target variant is
 * already 'translanguaging', this is a no-op. Failed translations are
 * allowed to retry on explicit user action.
 *
 * NOTE on theoretical race condition: Between reading store.getState()
 * and the async OLXJSON_TRANSLATING event landing in Redux, another
 * component could also read vs === undefined and fire a duplicate fetch.
 * This has been analyzed and is acceptable: the server deduplicates
 * in-flight translations, so the worst case is one extra HTTP request.
 * Closing this race would require a module-level Set outside Redux,
 * which breaks the "Redux is the single source of truth" invariant
 * for no meaningful benefit.
 *
 * NOT a hook — safe to call from event handlers.
 */
function ensureTranslation(
  props: EnsureTranslationProps,
  blockId: string,
  targetLocale: UserLocale,
  source: string
): void {
  if (props.runtime.sideEffectFree) return;

  const state = props.runtime.store.getState();
  const blockState = selectBlockState(state, [source], blockId as any);
  const vs = blockState?.variantStatus?.[targetLocale];
  if (vs?.status === 'translanguaging') return; // Already in flight

  dispatchOlxJsonTranslating(props, source, blockId, targetLocale);

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error('Translation request timed out'));
  }, TRANSLATION_FETCH_TIMEOUT_MS);

  fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      blockId,
      targetLocale,
    }),
  })
    .then(async res => {
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned non-JSON response (${res.status})`);
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Translation failed (${res.status})`);
      }
      return data;
    })
    .then(data => {
      // LOAD_OLXJSON clears variantStatus for arriving variants
      dispatchOlxJson(props, source, data.idMap);
    })
    .catch(err => {
      const reason =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Translation request timed out'
          : (err.message || String(err));
      console.warn(`[useTranslation] Translation failed for ${blockId}:`, reason);
      dispatchOlxJsonError(props, source, blockId, reason, targetLocale);
    })
    .finally(() => {
      clearTimeout(timeout);
    });
}

// =============================================================================
// useTranslation — hook
// =============================================================================

interface UseTranslationProps {
  runtime: {
    store: any;
    locale: { code: UserLocale };
    sideEffectFree: boolean;
    logEvent: LogEventFn;
  };
}

/**
 * Hook to detect language mismatch and provide opt-in translation.
 *
 * Reads variant status from olxjson's BlockEntry.variantStatus via useSelector.
 * On mismatch, returns isFallback: true and a requestTranslation callback.
 * Translation is NOT triggered automatically — the user must opt in via
 * the TranslatingIndicator UI or LanguageSwitcher.
 *
 * In sideEffectFree mode, never triggers a fetch. Returns translating: false
 * so the UI shows the fallback content without a spinner.
 */
export function useTranslation(
  props: UseTranslationProps,
  olxJson: OlxJson | null,
  source: string = 'content'
): TranslationState {
  const propsRef = useRef(props);
  propsRef.current = props;

  const userLocale: UserLocale = props.runtime.locale.code;
  const blockId = olxJson?.id;
  const contentLang = olxJson?.lang as ContentVariant | undefined;
  const rawTranslatable = olxJson?.attributes?.translatable;
  const translatable = rawTranslatable === false || rawTranslatable === 'false' ? false : undefined;

  const isFallback = userLocale && blockId
    ? needsTranslation(userLocale, contentLang, translatable)
    : false;

  // Read variant status from olxjson state — always call hook (React rules)
  const variantEntry = useSelector((state: any) => {
    if (!blockId || !userLocale) return undefined;
    const bs = selectBlockState(state, [source], blockId as any);
    return bs?.variantStatus?.[userLocale];
  });

  if (!olxJson || !userLocale) {
    return NO_TRANSLATION;
  }

  if (!isFallback) {
    return NO_TRANSLATION;
  }

  const translating = variantEntry?.status === 'translanguaging';
  const translationFailed = variantEntry?.status === 'error';

  // Provide a callback for explicit opt-in translation
  const requestTranslation = blockId && !props.runtime.sideEffectFree
    ? () => ensureTranslation(propsRef.current, blockId, userLocale, source)
    : null;

  return {
    isFallback: true,
    translating,
    translationFailed,
    translationError: variantEntry?.error ?? null,
    fallbackLocale: contentLang || null,
    targetLocale: userLocale,
    requestTranslation,
  };
}
