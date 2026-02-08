// src/lib/i18n/useTranslation.ts
//
// Client-side hook for reactive translanguaging.
//
// Detects language mismatches between user locale and displayed content,
// triggers server-side LLM translation, and dispatches results to Redux
// for reactive UI updates.
//
// Null olxJson: During loading, olxJson is null. Hooks must be called
// unconditionally (React rules), so we guard at the top and return
// NO_TRANSLATION. This is not an error — it's the normal loading state.
//
'use client';

import { useRef, useEffect, useState } from 'react';
import { scoreBCP47Match } from '@/lib/i18n/getBestVariant';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import type { OlxJson, UserLocale, ContentVariant } from '@/lib/types';
import type { LogEventFn } from '@/lib/render';

export interface TranslationState {
  /** True when showing content in a different language than the user requested */
  isFallback: boolean;
  /** True if translation was attempted and failed */
  translationFailed: boolean;
  /** The locale of the content being shown as fallback, or null if exact match */
  fallbackLocale: ContentVariant | null;
  /** The locale being translated to, or null if no translation needed */
  targetLocale: UserLocale | null;
}

const NO_TRANSLATION: TranslationState = {
  isFallback: false,
  translationFailed: false,
  fallbackLocale: null,
  targetLocale: null,
};

// Module-level dedup: tracks in-flight translation requests across all components.
// Keyed by blockId::targetLocale so multiple blocks from the same file
// don't trigger duplicate translations.
const translationsInFlight = new Set<string>();

/**
 * Is this a language mismatch that needs translation?
 *
 * lang='*' or undefined = language-agnostic content, never a fallback.
 * score >= 1 = same language family, acceptable match.
 * score < 1 = completely different language, needs translation.
 */
function needsTranslation(userLocale: UserLocale, contentLang: ContentVariant | undefined): boolean {
  if (!contentLang || contentLang === '*') return false;
  return scoreBCP47Match(userLocale, contentLang) < 1;
}

/**
 * Hook to detect language mismatch and trigger on-the-fly translation.
 *
 * Called after useOlxJson returns a valid olxJson. Compares the content's
 * language against the user's requested locale. If there's a mismatch,
 * kicks off a server-side LLM translation via POST /api/translate.
 *
 * When the translation completes, the new variant is dispatched to Redux,
 * and React reactivity automatically re-renders the block.
 */
interface UseTranslationProps {
  runtime: {
    locale: { code: UserLocale };
    sideEffectFree: boolean;
    logEvent: LogEventFn;
  };
}

export function useTranslation(
  props: UseTranslationProps,
  olxJson: OlxJson | null,
  source: string = 'content'
): TranslationState {
  const translationAttempted = useRef(new Set<string>());
  const [failedKeys, setFailedKeys] = useState(new Set<string>());
  const propsRef = useRef(props);
  propsRef.current = props;

  const userLocale: UserLocale = props.runtime.locale.code;
  const blockId = olxJson?.id;  // OlxKey | undefined
  const contentLang = olxJson?.lang as ContentVariant | undefined;

  const isFallback = userLocale && blockId
    ? needsTranslation(userLocale, contentLang)
    : false;

  const dedupeKey = blockId && userLocale ? `${blockId}::${userLocale}` : null;
  const translationFailed = dedupeKey ? failedKeys.has(dedupeKey) : false;

  useEffect(() => {
    if (!blockId || !isFallback || !dedupeKey || !contentLang) return;
    if (propsRef.current.runtime.sideEffectFree) return;
    if (translationAttempted.current.has(dedupeKey) || translationsInFlight.has(dedupeKey)) return;

    translationAttempted.current.add(dedupeKey);
    translationsInFlight.add(dedupeKey);

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId,
        targetLocale: userLocale,
        sourceLocale: contentLang,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.idMap) {
          dispatchOlxJson(propsRef.current, source, data.idMap);
        } else {
          console.warn(`[useTranslation] Translation failed for ${blockId}:`, data.error);
          setFailedKeys(prev => new Set(prev).add(dedupeKey));
        }
      })
      .catch(err => {
        console.warn(`[useTranslation] Translation request failed for ${blockId}:`, err);
        setFailedKeys(prev => new Set(prev).add(dedupeKey));
      })
      .finally(() => {
        translationsInFlight.delete(dedupeKey);
      });
  }, [blockId, userLocale, isFallback, contentLang, dedupeKey, source]);

  if (!olxJson || !userLocale) {
    return NO_TRANSLATION;
  }

  return {
    isFallback,
    translationFailed,
    fallbackLocale: isFallback ? (contentLang || null) : null,
    targetLocale: isFallback ? userLocale : null,
  };
}
