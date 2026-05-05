'use client';
import type { RuntimeProps } from '@/lib/types';
import React, { useRef, useMemo, useEffect } from 'react';
import * as Plot from '@observablehq/plot';
import { useValue } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';
import { segmentText } from '@/lib/textSegment';
import { groupHue, hslColor } from '@/lib/util/colorWheel';

// Subtle rotation factor (default 1/φ was visually noisy for stacked bars)
const COLOR_FACTOR = 0.618033988749895 / 15;

export type WordRow = { sentence: number; word: string; height: number; color: string };

/**
 * Parse text into one row per word, stacked within sentences.
 *
 * - Each word is a bar segment; height is character count (mode=characters) or 1 (mode=words)
 * - Words stack into sentence bars
 * - Sentences in the same paragraph are adjacent bars
 * - Paragraph gaps (jumps in sentence numbers) insert a spacer (empty bar)
 * - CJK text: each character is treated as a word (no space-based word boundaries)
 */
export function analyzeText(text: string, mode: string) {
  const tokens = segmentText('en', text);
  const data: WordRow[] = [];
  let lastSentence = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Detect paragraph gaps (sentence number jumps by 2+) and insert spacer
    if (t.sentence > lastSentence + 1 && lastSentence > 0) {
      data.push({ sentence: lastSentence + 1, word: '', height: 0, color: 'transparent' });
    }
    lastSentence = t.sentence;

    data.push({
      sentence: t.sentence,
      word: t.text,
      height: mode === 'words' ? 1 : t.text.length,
      color: hslColor(groupHue(i, COLOR_FACTOR), 0.55, 0.55),
    });
  }

  return data;
}

export default function _WritingRhythmPlot(props: RuntimeProps) {
  const { target, width, height, xrange, yrange, mode = 'characters' } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  // Reactively read target TextArea value
  const { value: text } = useValue(props, { target, fallback: '' });

  // Build plot node (Plot.plot() is synchronous)
  const plotNode = useMemo(() => {
    if (!text?.trim()) return null;

    const data = analyzeText(text, mode);
    if (data.length === 0) return null;

    // Pad with empty slots so band scale matches across plots with shared xrange
    if (xrange) {
      const maxSentence = Math.max(...data.map(d => d.sentence));
      for (let s = maxSentence + 1; s <= xrange; s++) {
        data.push({ sentence: s, word: '', height: 0, color: 'transparent' });
      }
    }

    return Plot.plot({
      width: width || undefined,
      height: height || 200,
      x: { label: null, axis: null },
      y: { axis: null, ...(yrange ? { domain: [0, yrange] } : {}) },
      marks: [
        Plot.barY(data, Plot.stackY({
          x: 'sentence',
          y: 'height',
          fill: 'color',
          title: 'word',
        })),
        Plot.ruleY([0]),
      ],
    });
  }, [text, width, height, xrange, yrange, mode]);

  // Mount the Plot-generated DOM node
  useEffect(() => {
    if (!containerRef.current) return;
    if (plotNode) containerRef.current.replaceChildren(plotNode);
    else containerRef.current.replaceChildren();
  }, [plotNode]);

  if (!target) {
    return <DisplayError props={props} title="WritingRhythmPlot" message="No target specified" />;
  }

  const minHeight = height || 200;

  if (!plotNode) {
    return (
      <div style={{
        minHeight,
        border: '1px dashed #ccc',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
      }}>
        Writing rhythm plot
      </div>
    );
  }

  return <div ref={containerRef} style={{ minHeight }} />;
}
