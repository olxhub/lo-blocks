'use client';
import React, { useRef, useMemo, useEffect } from 'react';
import * as Plot from '@observablehq/plot';
import { useValue } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

const GOLDEN_RATIO = 0.618033988749895;

function wordColor(index: number): string {
  // Standard algorithm is (index * GOLDEN_RATIO * 360) % 360;
  // Gives optimal color assignment.
  //
  // However, this was visually super-noisy, so we scaled it back for now.
  const hue = (index * GOLDEN_RATIO * 360 / 15) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export type WordRow = { sentence: number; word: string; height: number; color: string };

// CJK Unified Ideographs, Extension A, Compatibility Ideographs,
// Hiragana, Katakana, Katakana Phonetic Extensions
const CJK = /[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

// Sentence-ending punctuation:
//   ASCII: .!?    CJK: 。！？    Arabic: ؟
// CJK punctuation splits without requiring trailing whitespace (Chinese has no spaces).
// ASCII punctuation requires trailing whitespace to avoid splitting on "Dr." or "U.S.A."
const SENTENCE_SPLIT = /(?<=[。！？؟])\s*|(?<=[.!?])\s+/;

/**
 * Parse text into one row per word, stacked within sentences.
 *
 * - Each word is a bar segment; height is character count (mode=characters) or 1 (mode=words)
 * - Words stack into sentence bars
 * - Sentences in the same paragraph are adjacent bars
 * - Newlines insert a spacer (empty bar) to visually separate paragraphs
 * - CJK text: each character is treated as a word (no space-based word boundaries)
 */
export function analyzeText(text: string, mode: string) {
  const lines = text.split(/\n/);
  const data: WordRow[] = [];
  let sentenceNum = 0;
  let wordIndex = 0;
  let lastWasEmpty = false;

  function pushWord(word: string) {
    data.push({
      sentence: sentenceNum,
      word,
      height: mode === 'words' ? 1 : word.length,
      color: wordColor(wordIndex++),
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line = paragraph break → insert spacer
    if (!trimmed) {
      if (!lastWasEmpty && sentenceNum > 0) {
        sentenceNum++;
        data.push({ sentence: sentenceNum, word: '', height: 0, color: 'transparent' });
      }
      lastWasEmpty = true;
      continue;
    }
    lastWasEmpty = false;

    const sentences = trimmed.split(SENTENCE_SPLIT).filter(s => s.trim());

    for (const sentence of sentences) {
      sentenceNum++;
      const tokens = sentence.split(/\s+/).filter(Boolean);

      for (const raw of tokens) {
        if (CJK.test(raw)) {
          // Split into individual CJK characters and non-CJK runs
          // e.g. "我喜欢Unicode" → ["我", "喜", "欢", "Unicode"]
          let run = '';
          for (const char of raw) {
            if (CJK.test(char)) {
              if (run) { const c = run.replace(/[^\p{L}']/gu, ''); if (c) pushWord(c); run = ''; }
              pushWord(char);
            } else {
              run += char;
            }
          }
          if (run) { const c = run.replace(/[^\p{L}']/gu, ''); if (c) pushWord(c); }
        } else {
          const cleaned = raw.replace(/[^\p{L}']/gu, '');
          if (cleaned) pushWord(cleaned);
        }
      }
    }
  }

  return data;
}

export default function _SentenceVarietyPlot(props) {
  const { target, width, height, xrange, yrange, mode = 'characters' } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  // Reactively read target TextArea value
  const { value: text } = useValue(props, target, { fallback: '' });

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
    return <DisplayError props={props} name="SentenceVarietyPlot" message="No target specified" />;
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
        Sentence variety plot
      </div>
    );
  }

  return <div ref={containerRef} style={{ minHeight }} />;
}
