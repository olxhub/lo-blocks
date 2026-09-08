// packages/shared/components/blocks/language-arts/TextSelection/_TextSelectionInput.tsx
//
// Renderer for TextSelectionInput. Draws the passage and lets the learner build
// a selection. The selection — an array of word indices — is the input's value;
// grading, scoring, feedback text, and the Check/Show-Answer controls all live
// elsewhere (TextSelectionGrader + the standard problem footer).
//
// Two selectable units, one value:
//   - TOKEN mode (no `separatorRegexp`): the word. Clicking a word toggles it;
//     dragging applies one gesture across the span — starting on an unselected
//     word selects everything it touches, starting on a selected word clears
//     everything it touches (`applyGesture`).
//   - CHUNK mode (`separatorRegexp` set): the chunk the model projects between
//     separator matches. A chunk is a real button — click, Enter, or Space
//     toggles the whole chunk, hover outlines it, and a drag flips every chunk
//     it touched. Selecting a chunk writes all of its word indices, so the
//     stored value, the grader, and the analytics heatmap are unchanged.
//
// What this component still owns, and why:
//   - the selection interaction (the two modes above)
//   - per-term targeted feedback, a pure function of selection × parse
//   - the answer overlay on Show Answer, driven by the grader's showAnswer
//     signal (useGraderAnswer) — no hand-rolled reveal state
//
// The pure parts — chunking, the gesture rules — live in textSelectionModel.ts;
// this file is the DOM and the styling.
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFieldState, getDecodedField } from '@/lib/state';
import { useGraderAnswer } from '@/lib/player/useGraderAnswer';
import { useInputReadOnly } from '@/lib/player/inputInteraction';
import { DisplayError } from '@/lib/util/debug';
import {
  projectParse, chunkProjection, targetedFeedbackItems, applyGesture, toggleChunks,
  anchorChanged,
  type Chunk, type ParsedDocument, type Token, type WordToken,
} from './textSelectionModel';

// Stable empty fallback: the subscription compares by reference, so the
// unanswered case must not mint a new array per store dispatch.
const EMPTY_SELECTIONS: number[] = [];

export default function TextSelectionInput(props: RuntimeProps) {
  const parsed = (props.kids as { parsed?: ParsedDocument })?.parsed;
  // OLX attributes arrive as raw strings; `separatorHidden` accepts either the
  // string or a real boolean so hand-built props behave the same as markup.
  const separatorRegexp: string | undefined = props.separatorRegexp;
  const separatorHidden = props.separatorHidden === true || props.separatorHidden === 'true';

  // One projection of the parse — render tokens AND the grader's segment facts
  // (types, word indices, labels, feedback map) — from a single tokenization,
  // shared with the grader through the model's memo. The component classifies
  // nothing itself; it renders tokens and asks the model which segments a
  // selection has fully selected.
  const projection = useMemo(
    () => (parsed?.segments ? projectParse(parsed) : null),
    [parsed],
  );
  const tokens: Token[] = projection?.tokens ?? [];
  const expected = projection?.expected ?? null;

  // Chunk mode, when the author asked for it. The model throws on an
  // unusable separator or a bracket span straddling a boundary; both are
  // authoring errors, surfaced through the block's content-error path rather
  // than taking the page down.
  const chunking = useMemo(() => {
    if (!parsed?.segments || !separatorRegexp) return { projection: null, error: null as string | null };
    try {
      return {
        projection: chunkProjection(parsed, separatorRegexp, separatorHidden, String(props.id)),
        error: null as string | null,
      };
    } catch (e) {
      return { projection: null, error: (e as Error).message };
    }
  }, [parsed, separatorRegexp, separatorHidden, props.id]);
  const chunks: Chunk[] | null = chunking.projection ? chunking.projection.chunks : null;

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

  // The gesture's anchor lives in the store, as a declared field
  // (TextSelectionInput.ts) rather than local state, so the platform persists
  // and logs it like every other piece of block state.
  const [, setGestureAnchor] = useFieldState(props, props.fields.gestureAnchor, null);
  // Read from the store, not from the subscribed value above: a word's
  // mousedown writes the anchor in the same synchronous event that arms the
  // gesture's finalizer, so the finalizer's closure — and the render that
  // paints the live preview — must see the write that just happened rather than
  // the value the last render captured. Level 2 is the whole value here; the
  // field has no blueprint getter.
  const anchorNow = (): number | null =>
    getDecodedField<number | null>(props, props.fields.gestureAnchor, { fallback: null });
  // One event per transition, so the log holds the gesture and not the pointer.
  const setAnchor = (next: number | null) => {
    if (anchorChanged(anchorNow(), next)) setGestureAnchor(next);
  };

  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  // The document-level mouseup that finalizes the current gesture, held so it can
  // be removed on the next mousedown or on unmount (F1: releasing outside the
  // passage must still commit).
  const finalizeGesture = useRef<(() => void) | null>(null);

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

  // The chunks a set of touched words falls in, in passage order. Chunk mode only.
  const chunksTouchedBy = (touched: Set<number>): Chunk[] => {
    if (!chunking.projection || !chunks) return [];
    const hit = new Set<number>();
    for (const index of touched) {
      const home = chunking.projection.chunkOfWord.get(index);
      if (home !== undefined) hit.add(home);
    }
    return chunks.filter(chunk => hit.has(chunk.index));
  };

  // One gesture, applied by whichever rule this input's mode uses.
  const applyTouched = (base: Set<number>, touched: Set<number>): Set<number> =>
    chunks ? toggleChunks(base, chunksTouchedBy(touched)) : applyGesture(base, touched, anchorNow());

  const handleWordClick = (wordIndex: number) => {
    if (locked || wordIndex < 0) return;
    // A drag ends in mouseup; a bare click (no range) toggles the one word.
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    setSelected(applyGesture(selected, new Set([wordIndex]), wordIndex));
  };

  const handleChunkClick = (chunk: Chunk) => {
    if (locked) return;
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    setSelected(toggleChunks(selected, [chunk]));
  };

  const handleChunkKeyDown = (event: React.KeyboardEvent, chunk: Chunk) => {
    if (locked || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    setSelected(toggleChunks(selected, [chunk]));
  };

  const handleMouseDown = () => {
    if (locked) return;
    isSelecting.current = true;
    liveBrowserSelection.current = new Set();
    window.getSelection()?.removeAllRanges();

    // Finalize on the DOCUMENT's mouseup, not the passage's: a drag that starts
    // in the passage and releases outside it still commits, and isSelecting never
    // strands. `selected` here is the gesture's start state — the correct base
    // for the gesture, even if the live preview re-rendered mid-drag.
    if (finalizeGesture.current) document.removeEventListener('mouseup', finalizeGesture.current);
    const commit = () => {
      if (!isSelecting.current) return;
      isSelecting.current = false;
      document.removeEventListener('mouseup', commit);
      finalizeGesture.current = null;
      const sel = window.getSelection();
      if (!sel || sel.toString().length === 0) {
        setAnchor(null); // the gesture is over; the anchor outlives nothing
        forceUpdate(); // a bare click (the click handler commits it); drop the preview
        return;
      }
      setSelected(applyTouched(selected, readBrowserSelection()));
      setAnchor(null);
      // Clear the native highlight so only our styling shows.
      setTimeout(() => window.getSelection()?.removeAllRanges(), 10);
    };
    finalizeGesture.current = commit;
    document.addEventListener('mouseup', commit);
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
    return () => document.removeEventListener('selectionchange', onChange);
  }, [locked]);

  // Never leave a gesture's document mouseup registered past unmount.
  useEffect(() => () => {
    if (finalizeGesture.current) {
      document.removeEventListener('mouseup', finalizeGesture.current);
      finalizeGesture.current = null;
    }
  }, []);

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

  if (chunking.error) {
    return (
      <DisplayError
        props={props}
        title="TextSelection Separator Error"
        message="Unable to divide the passage into selectable chunks"
        technical={chunking.error}
      />
    );
  }

  // The selection actually shown: committed, plus the in-flight drag preview.
  const effectiveSelection =
    isSelecting.current && liveBrowserSelection.current.size > 0
      ? applyTouched(selected, liveBrowserSelection.current)
      : selected;

  // Per-word painting. In chunk mode the chunk owns the selection outline, so a
  // word only carries the reveal colours; in token mode it carries both.
  const wordStyle = (word: WordToken): React.CSSProperties => {
    const isSelected = effectiveSelection.has(word.index);
    let backgroundColor = '';
    let borderColor = '';

    // Semantic theme tokens (defined in styles/tokens/semantic.css) rather than
    // literal hexes, so the highlights track light/dark like the rest of the UI:
    // required→success, optional→warning, decoy→error, a bare pick→muted.
    if (showAnswer) {
      // Reveal: show the key by segment type, overlaying the learner's picks.
      if (word.isRequired) backgroundColor = 'var(--lo-success-subtle)';
      else if (word.isOptional) backgroundColor = 'var(--lo-warning-subtle)';
      else if (word.isFeedbackTrigger) backgroundColor = 'var(--lo-error-subtle)';
      if (isSelected && !chunks) borderColor = 'var(--lo-border-strong)';
    } else if (isSelected && !chunks) {
      backgroundColor = 'var(--lo-bg-muted)';
      borderColor = 'var(--lo-border-strong)';
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

  // A chunk is outlined as a whole when it is selected. The dashed HOVER
  // outline is a `:hover` rule on .text-chunk-live (textselection.css) — no
  // state of any kind — and the inline outline below deliberately wins over it,
  // so hovering a selected chunk keeps the solid outline.
  const chunkStyle = (chunk: Chunk): React.CSSProperties => {
    const isSelected = chunk.wordIndices.every(i => effectiveSelection.has(i));
    return {
      backgroundColor: isSelected && !showAnswer ? 'var(--lo-bg-muted)' : '',
      outline: isSelected ? '2px solid var(--lo-border-strong)' : '',
      outlineOffset: '1px',
      borderRadius: '4px',
      cursor: locked ? 'default' : 'pointer',
    };
  };

  const renderToken = (token: Token, key: number) =>
    token.isSpace ? (
      <span key={key}>{token.text}</span>
    ) : (
      <span
        key={key}
        ref={(el) => {
          if (el) wordRefs.current.set(token.index, el);
          else wordRefs.current.delete(token.index);
        }}
        onMouseDown={() => { setAnchor(token.index); }}
        onClick={chunks ? undefined : () => handleWordClick(token.index)}
        style={wordStyle(token)}
      >
        {token.text}
      </span>
    );

  // Targeted feedback for each FULLY selected labeled segment. The model owns
  // the "selected ⇔ every word" rule, so these notes track the score exactly —
  // a half-selected phrase shows nothing rather than a premature "Correct!".
  const feedbackItems = expected ? targetedFeedbackItems(effectiveSelection, expected) : [];

  return (
    <div className="text-highlight-container p-4 border rounded-lg">
      <style>{`
        .text-highlight-container .text-content ::selection { background-color: transparent; }
        .text-highlight-container .text-content ::-moz-selection { background-color: transparent; }
      `}</style>

      {parsed.prompt && <div className="prompt mb-4 font-semibold text-lg">{parsed.prompt}</div>}

      <div
        className="text-content mb-4 text-base leading-relaxed"
        onMouseDownCapture={() => { setAnchor(null); }}
        onMouseDown={handleMouseDown}
        style={{ WebkitUserSelect: 'text', MozUserSelect: 'text', userSelect: 'text' }}
      >
        {chunks
          // Chunk mode. Chunks are separated by a single space: whichever
          // whitespace the separator swallowed, the words never run together.
          ? chunks.map((chunk, position) => (
            <React.Fragment key={chunk.index}>
              {position > 0 && ' '}
              <span
                // .text-chunk-live is the hover affordance: a locked passage is
                // a reference, not an input, so it does not get one.
                className={locked ? 'text-chunk' : 'text-chunk text-chunk-live'}
                role="button"
                tabIndex={locked ? -1 : 0}
                aria-pressed={chunk.wordIndices.every(i => effectiveSelection.has(i))}
                onClick={() => handleChunkClick(chunk)}
                onKeyDown={(event) => handleChunkKeyDown(event, chunk)}
                style={chunkStyle(chunk)}
              >
                {chunk.tokens.map(renderToken)}
              </span>
            </React.Fragment>
          ))
          : tokens.map(renderToken)}
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
