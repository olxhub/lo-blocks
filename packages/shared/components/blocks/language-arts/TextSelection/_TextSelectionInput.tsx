// packages/shared/components/blocks/language-arts/TextSelection/_TextSelectionInput.tsx
//
// Renderer for TextSelectionInput. Draws the passage word-by-word and lets the
// learner build a selection by clicking single words or dragging across a span.
// The selection — an array of word indices — is the input's value; grading,
// scoring, feedback text, and the Check/Show-Answer controls all live
// elsewhere (TextSelectionGrader + the standard problem footer).
//
// What this component still owns, and why:
//   - the selection interaction (click toggles a word; drag toggles a span)
//   - per-term targeted feedback, a pure function of selection × parse
//   - the answer overlay on Show Answer, driven by the grader's showAnswer
//     signal (useGraderAnswer) — no hand-rolled reveal state
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFieldState } from '@/lib/state';
import { useGraderAnswer, useInputReadOnly } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';
import { tokenize, type ParsedDocument, type Token, type WordToken } from './textSelectionModel';

// Stable empty fallback: the subscription compares by reference, so the
// unanswered case must not mint a new array per store dispatch.
const EMPTY_SELECTIONS: number[] = [];

// Toggle every word in `browserSelection` against the committed selection —
// the pure core of drag-to-select, shared by the live preview and the commit.
function toggleSpan(committed: Set<number>, browserSelection: Set<number>): Set<number> {
  if (browserSelection.size === 0) return committed;
  const next = new Set(committed);
  for (const idx of browserSelection) {
    if (next.has(idx)) next.delete(idx); else next.add(idx);
  }
  return next;
}

export default function TextSelectionInput(props: RuntimeProps) {
  const parsed = (props.kids as { parsed?: ParsedDocument })?.parsed;

  const tokens: Token[] = useMemo(
    () => (parsed?.segments ? tokenize(parsed.segments) : []),
    [parsed],
  );

  // Stored selection, held as a Set for membership tests, written back as an array.
  const [selectedArray, setSelectedArray] = useFieldState(props, props.fields.selections, EMPTY_SELECTIONS);
  const selected = useMemo(() => new Set<number>(selectedArray || []), [selectedArray]);
  const setSelected = (next: Set<number>) => setSelectedArray(Array.from(next));

  const { showAnswer } = useGraderAnswer(props);
  const readOnly = useInputReadOnly(props);
  // Once the answer is revealed the passage is a reference, not an input.
  const locked = readOnly || showAnswer;

  // Drag bookkeeping. A ref (not state) so mid-drag mousemoves don't thrash the
  // store; a forceUpdate paints the live preview.
  const wordRefs = useRef(new Map<number, HTMLElement>());
  const isSelecting = useRef(false);
  const liveBrowserSelection = useRef(new Set<number>());
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  // Which words the browser's native selection currently covers.
  const readBrowserSelection = (): Set<number> => {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return new Set();
    const range = sel.getRangeAt(0);
    const hit = new Set<number>();
    wordRefs.current.forEach((el, index) => {
      if (!el || index < 0) return;
      const wordRange = document.createRange();
      wordRange.selectNodeContents(el);
      const intersects =
        range.compareBoundaryPoints(Range.START_TO_END, wordRange) >= 0 &&
        range.compareBoundaryPoints(Range.END_TO_START, wordRange) <= 0;
      if (intersects) hit.add(index);
    });
    return hit;
  };

  const handleWordClick = (wordIndex: number) => {
    if (locked || wordIndex < 0) return;
    // A drag ends in mouseup; a bare click (no range) toggles the one word.
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    setSelected(toggleSpan(selected, new Set([wordIndex])));
  };

  const handleMouseDown = () => {
    if (locked) return;
    isSelecting.current = true;
    liveBrowserSelection.current = new Set();
    window.getSelection()?.removeAllRanges();
  };

  const handleMouseUp = () => {
    if (!isSelecting.current) return;
    isSelecting.current = false;
    const sel = window.getSelection();
    if (!sel || sel.toString().length === 0) return; // a click, not a drag
    setSelected(toggleSpan(selected, readBrowserSelection()));
    // Clear the native highlight so only our styling shows.
    setTimeout(() => window.getSelection()?.removeAllRanges(), 10);
  };

  // Paint a live preview while dragging.
  useEffect(() => {
    if (locked) return;
    const onChange = () => {
      if (!isSelecting.current) return;
      liveBrowserSelection.current = readBrowserSelection();
      forceUpdate();
    };
    document.addEventListener('selectionchange', onChange);
    const refs = wordRefs.current;
    return () => {
      document.removeEventListener('selectionchange', onChange);
      refs.clear();
    };
  }, [locked]);

  if (!parsed || parsed.error) {
    return (
      <DisplayError
        props={props}
        title="TextSelection Parsing Error"
        message="Unable to parse TextSelection content"
        technical={parsed?.prompt}
      />
    );
  }

  // The selection actually shown: committed, plus the in-flight drag preview.
  const effectiveSelection =
    isSelecting.current && liveBrowserSelection.current.size > 0
      ? toggleSpan(selected, liveBrowserSelection.current)
      : selected;

  const wordStyle = (word: WordToken): React.CSSProperties => {
    const isSelected = effectiveSelection.has(word.index);
    let backgroundColor = '';
    let borderColor = '';

    if (showAnswer) {
      // Reveal: show the key by segment type, overlaying the learner's picks.
      if (word.isRequired) backgroundColor = '#c3f0c3';
      else if (word.isOptional) backgroundColor = '#fff3cd';
      else if (word.isFeedbackTrigger) backgroundColor = '#ffcdd2';
      if (isSelected) borderColor = '#9e9e9e';
    } else if (isSelected) {
      backgroundColor = '#e3e3e3';
      borderColor = '#9e9e9e';
    }

    return {
      backgroundColor,
      outline: borderColor ? `2px solid ${borderColor}` : '',
      outlineOffset: '-2px',
      borderRadius: '3px',
      padding: '2px 4px',
      margin: '0 -2px',
      cursor: locked ? 'default' : 'pointer',
    };
  };

  // Targeted feedback for each selected segment that has an authored note.
  const feedbackItems = (() => {
    const targeted = parsed.targetedFeedback || {};
    const seen = new Set<string>();
    const items: { id: string; label: string; text: string }[] = [];
    for (const token of tokens) {
      if (token.isSpace || !effectiveSelection.has(token.index)) continue;
      const id = token.segmentId;
      if (!id || seen.has(id) || !targeted[id]) continue;
      seen.add(id);
      const label = tokens
        .filter((t): t is WordToken => !t.isSpace && t.segmentId === id)
        .map(t => t.text)
        .join(' ');
      items.push({ id, label, text: targeted[id] });
    }
    return items;
  })();

  return (
    <div className="text-highlight-container p-4 border rounded-lg">
      <style>{`
        .text-highlight-container .text-content ::selection { background-color: transparent; }
        .text-highlight-container .text-content ::-moz-selection { background-color: transparent; }
      `}</style>

      {parsed.prompt && <div className="prompt mb-4 font-semibold text-lg">{parsed.prompt}</div>}

      <div
        className="text-content mb-4 text-base leading-relaxed"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{ WebkitUserSelect: 'text', MozUserSelect: 'text', userSelect: 'text' }}
      >
        {tokens.map((token, idx) =>
          token.isSpace ? (
            <span key={idx}>{token.text}</span>
          ) : (
            <span
              key={idx}
              ref={(el) => {
                if (el) wordRefs.current.set(token.index, el);
                else wordRefs.current.delete(token.index);
              }}
              onClick={() => handleWordClick(token.index)}
              style={wordStyle(token)}
            >
              {token.text}
            </span>
          ),
        )}
      </div>

      {feedbackItems.length > 0 && (
        <div className="targeted-feedback mt-2 text-sm">
          {feedbackItems.map(({ id, label, text }) => (
            <div key={id} className="mb-1 text-secondary"><strong>{label}:</strong> {text}</div>
          ))}
        </div>
      )}
    </div>
  );
}
