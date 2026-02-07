// src/components/common/TranslatingIndicator.tsx
//
// Visual indicator wrapping block content during translation.
//
// Three states:
// - Translating (fallback + in-flight): Content at reduced opacity + amber badge with spinner
// - Fallback only (LLM unavailable/failed): Subtle gray badge showing source language
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
  const { isTranslating, isFallback, fallbackLocale } = translationState;

  if (!isFallback && !isTranslating) {
    return <>{children}</>;
  }

  const langLabel = fallbackLocale ? getLanguageLabel(fallbackLocale, 'en', 'short') : '';

  return (
    <div className="relative">
      {isTranslating && (
        <div className="absolute top-1 end-1 z-10 flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full shadow-sm">
          <span
            className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full"
            style={{ animation: 'spin 1s linear infinite' }}
          />
          Translating...
        </div>
      )}
      {isFallback && !isTranslating && (
        <div className="absolute top-1 end-1 z-10 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded shadow-sm">
          Shown in {langLabel}
        </div>
      )}
      <div style={isTranslating ? { opacity: 0.75, transition: 'opacity 0.3s' } : undefined}>
        {children}
      </div>
    </div>
  );
}
