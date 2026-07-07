// packages/shared/components/blocks/language-arts/WordUsage/_WordUsage.tsx
// highlighted spans via TextHighlightRenderer.

'use client';

import React, { useMemo } from 'react';
import { useValue } from '@/lib/state';
import type { RuntimeProps } from '@/lib/types';
import { DisplayError } from '@/lib/util/debug';
import TextHighlightRenderer from '@/components/common/TextHighlightRenderer';
import { analyzeHighlights, type AnalysisMode } from './analysis';

export default function WordUsage(props: RuntimeProps) {
  const { target, mode, summary, highlight, words } = props;

  // Hooks must be called unconditionally (React rules of hooks), so useValue
  // runs before we validate target/mode. When target is undefined, useValue
  // returns an inert fallback — no unnecessary fetch is triggered.
  const { value: text, loading, error } = useValue(props, { target, fallback: '' });

  const locale = props.runtime?.locale?.code ?? 'en';

  const highlights = useMemo(() => {
    if (!text?.trim()) return [];
    return analyzeHighlights(text, mode as AnalysisMode, locale, { words });
  }, [text, mode, locale, words]);

  if (!target) {
    return <DisplayError props={props} title="WordUsage" message="No target specified" />;
  }
  if (!mode) {
    return <DisplayError props={props} title="WordUsage" message="No mode specified" />;
  }
  if (mode === 'transition_words' && !words) {
    return <DisplayError props={props} title="WordUsage"
      message="transition_words mode requires a word list (inline text or src attribute)" />;
  }

  if (loading) {
    return <div className="lo-text-highlight lo-text-highlight--placeholder">Text highlight</div>;
  }

  if (error) {
    return <DisplayError props={props} title="WordUsage" message={error} />;
  }

  if (!text?.trim()) {
    return <div className="lo-text-highlight lo-text-highlight--placeholder">Waiting for text</div>;
  }

  return (
    <TextHighlightRenderer
      text={text}
      highlights={highlights}
      showHighlight={highlight}
      showSummary={summary}
    />
  );
}
