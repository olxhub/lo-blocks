// src/lib/i18n/useTranslation.ts
//
// Client-side hook for reactive translanguaging.
//
// Detects language mismatches between user locale and displayed content,
// triggers server-side LLM translation, and dispatches results to Redux
// for reactive UI updates.
//
'use client';

import { useRef, useEffect, useState } from 'react';
import { scoreBCP47Match } from '@/lib/i18n/getBestVariant';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import type { OlxJson } from '@/lib/types';
import type { LangMap } from '@/lib/state/olxjson';

export interface TranslationState {
  /** True while LLM translation is in progress for this block */
  isTranslating: boolean;
  /** True when showing content in a different language than the user requested */
  isFallback: boolean;
  /** The locale of the content being shown as fallback, or null if exact match */
  fallbackLocale: string | null;
}

const NO_TRANSLATION: TranslationState = {
  isTranslating: false,
  isFallback: false,
  fallbackLocale: null,
};

// Module-level dedup: tracks in-flight translation requests across all components.
// Keyed by provenance::targetLocale so multiple blocks from the same file
// don't trigger duplicate translations.
const translationsInFlight = new Set<string>();

/**
 * Hook to detect language mismatch and trigger on-the-fly translation.
 *
 * Called after useOlxJson returns a valid olxJson. Compares the content's
 * language against the user's requested locale. If there's a mismatch
 * (score < 1 = completely different language), kicks off a server-side
 * LLM translation via POST /api/translate.
 *
 * When the translation completes, the new variant is dispatched to Redux,
 * and React reactivity automatically re-renders the block.
 */
export function useTranslation(
  props: any,
  olxJson: OlxJson | null,
  langMap: LangMap | null,
  source: string = 'content'
): TranslationState {
  const translationAttempted = useRef<Set<string>>(new Set());
  const [translatingKeys, setTranslatingKeys] = useState<Set<string>>(new Set());

  const userLocale = props?.runtime?.locale?.code;
  const blockId = olxJson?.id;
  const contentLang = olxJson?.lang;
  const provenance = olxJson?.provenance;

  // Determine if this is a fallback situation
  // lang='*' or undefined = language-agnostic content, never triggers translation
  // score >= 1 = same language family, acceptable match
  // score < 1 = completely different language, needs translation
  const isFallback = (() => {
    if (!contentLang || contentLang === '*' || !userLocale) return false;
    const score = scoreBCP47Match(userLocale, contentLang);
    return score < 1;
  })();

  // Get a stable provenance key for dedup (first provenance entry = root file)
  const provenanceKey = Array.isArray(provenance) && provenance.length > 0
    ? provenance[0]
    : null;

  const dedupeKey = provenanceKey && userLocale
    ? `${provenanceKey}::${userLocale}`
    : null;

  const isTranslating = dedupeKey ? translatingKeys.has(dedupeKey) : false;

  useEffect(() => {
    if (!blockId || !isFallback || !olxJson || !provenanceKey || !dedupeKey) return;
    if (props?.runtime?.sideEffectFree) return;

    // Already attempted or already in flight
    if (translationAttempted.current.has(dedupeKey) || translationsInFlight.has(dedupeKey)) return;

    translationAttempted.current.add(dedupeKey);
    translationsInFlight.add(dedupeKey);
    setTranslatingKeys(prev => new Set(prev).add(dedupeKey));

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provenance: provenanceKey,
        targetLocale: userLocale,
        sourceLocale: contentLang,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.idMap) {
          dispatchOlxJson(props, source, data.idMap);
        } else if (!data.ok) {
          console.warn(`[useTranslation] Translation failed for ${blockId}:`, data.error);
        }
      })
      .catch(err => {
        console.warn(`[useTranslation] Translation request failed for ${blockId}:`, err);
      })
      .finally(() => {
        translationsInFlight.delete(dedupeKey);
        setTranslatingKeys(prev => {
          const next = new Set(prev);
          next.delete(dedupeKey);
          return next;
        });
      });
  }, [blockId, userLocale, isFallback, contentLang, provenanceKey, dedupeKey, source, props?.runtime?.sideEffectFree]);

  // No olxJson or no locale = no translation state
  if (!olxJson || !userLocale) {
    return NO_TRANSLATION;
  }

  return {
    isTranslating,
    isFallback,
    fallbackLocale: isFallback ? (contentLang || null) : null,
  };
}
