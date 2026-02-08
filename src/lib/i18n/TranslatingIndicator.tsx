// src/lib/i18n/TranslatingIndicator.tsx
//
// Visual indicator wrapping block content during translation.
//
// Three states:
// - Translating: Amber banner with spinner + content at reduced opacity
// - Failed: Red banner indicating translation failed
// - Neither: Renders children directly with no wrapper
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
  const { isFallback, translationFailed, fallbackLocale, targetLocale } = translationState;

  // No mismatch — render children directly, no wrapper
  if (!isFallback) {
    return <>{children}</>;
  }

  const fromLabel = fallbackLocale ? getLanguageLabel(fallbackLocale, 'en', 'name') : 'unknown';
  const toLabel = targetLocale ? getLanguageLabel(targetLocale, 'en', 'name') : 'unknown';

  return (
    <div>
      {translationFailed ? (
        <div role="status" className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          Translation failed ({fromLabel} → {toLabel})
        </div>
      ) : (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded">
          <span aria-hidden="true" className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          Translating {fromLabel} → {toLabel}...
        </div>
      )}
      <div style={!translationFailed ? { opacity: 0.6, transition: 'opacity 0.3s' } : undefined}>
        {children}
      </div>
    </div>
  );
}
