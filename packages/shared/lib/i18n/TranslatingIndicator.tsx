// packages/shared/lib/i18n/TranslatingIndicator.tsx
//
// Visual indicator wrapping block content during translation.
//
// Five states:
// - No mismatch: Renders children directly with no wrapper
// - Fallback (translatable): Info banner with "Translate" button — user opts in
// - Translating: Amber banner with spinner + content at reduced opacity
// - Failed: Red banner with error message + retry button, content at full opacity
// - Fallback (sideEffectFree): Gray info banner showing language mismatch
//
'use client';

import React from 'react';
import type { TranslationState } from '@/lib/i18n/useTranslation';
import { getLanguageLabel } from '@/lib/i18n/languages';

interface TranslatingIndicatorProps {
  translationState: TranslationState;
  children: React.ReactNode;
}

export default function TranslatingIndicator({ translationState, children }: TranslatingIndicatorProps) {
  const {
    isFallback, translating, translationFailed, translationError,
    fallbackLocale, targetLocale, requestTranslation,
  } = translationState;

  // No mismatch — render children directly, no wrapper
  if (!isFallback) {
    return <>{children}</>;
  }

  const fromLabel = fallbackLocale ? getLanguageLabel(fallbackLocale, 'en', 'name') : 'unknown';
  const toLabel = targetLocale ? getLanguageLabel(targetLocale, 'en', 'name') : 'unknown';

  if (translationFailed) {
    return (
      <div>
        <div role="status" className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          <span>Translation failed ({fromLabel} → {toLabel}){translationError ? `: ${translationError}` : ''}</span>
          {requestTranslation && (
            <button
              onClick={requestTranslation}
              className="ms-auto text-xs px-2 py-0.5 bg-red-100 hover:bg-red-200 border border-red-300 rounded whitespace-nowrap"
            >
              Retry
            </button>
          )}
        </div>
        <div>{children}</div>
      </div>
    );
  }

  if (translating) {
    return (
      <div>
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded">
          <span aria-hidden="true" className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          Translating {fromLabel} → {toLabel}...
        </div>
        <div style={{ opacity: 0.6, transition: 'opacity 0.3s' }}>
          {children}
        </div>
      </div>
    );
  }

  // Fallback: not translating and not failed — offer opt-in translation
  if (requestTranslation) {
    return (
      <div>
        <div role="status" className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded">
          <span>Showing {fromLabel}</span>
          <button
            onClick={requestTranslation}
            className="ms-auto text-xs px-2 py-0.5 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded whitespace-nowrap"
          >
            Translate to {toLabel}
          </button>
        </div>
        <div>{children}</div>
      </div>
    );
  }

  // sideEffectFree mode — no translation available, just show info
  return (
    <div>
      <div role="status" className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded">
        Showing {fromLabel} (requested {toLabel})
      </div>
      <div>{children}</div>
    </div>
  );
}
