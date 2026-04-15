// _Freewrite - freewriting input with optional constraints.
//
// A textarea with composable writing constraints:
//   invisible - text hidden while typing (revealed when parent goes inert)
//   nodelete  - cursor locked to end, no backspace/delete/cut
//   counter   - live word count (prominent when invisible)
//   pace      - CSS-animated bar that decays from green→red during pauses;
//               when the bar reaches zero, the exercise auto-locks
//
// Two independent reveal paths:
//   1. Redux `revealed` state — set by Reveal button click or pace auto-lock.
//      Component goes readOnly, --invisible class removed.
//   2. CSS `[inert]` rule — when a parent TimedContainer expires, it sets
//      inert on its content div. CSS overrides --invisible to show text.
//      Note: this does NOT set `revealed` in Redux. If analytics ever need
//      to know "did the student see their text?", this gap needs closing
//      (e.g. MutationObserver on the inert attribute).

'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { useFieldState } from '@/lib/state';
import type { RuntimeProps } from '@/lib/types';

// ─── Word count ───────────────────────────────────────────────────────────

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ─── Component ────────────────────────────────────────────────────────────

function _Freewrite(props: RuntimeProps) {
  const {
    fields,
    invisible, nodelete,
    autofocus, counter, pace,
    pacedecay, reveal,
    placeholder, rows,
  } = props;

  // Redux state
  const [value, setValue] = useFieldState(props, fields.value, '');
  const [revealed, setRevealed] = useFieldState(props, fields.revealed, false);
  const [lastKeystrokeTime, setLastKeystrokeTime] = useFieldState(props, fields.lastKeystrokeTime, null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Auto-lock: when pace is on, set a timeout after each keystroke.
  // If no new non-whitespace input arrives before pacedecay, lock the exercise.
  // Note: pacedecay is already in seconds (parsed by z_olx_duration from e.g. "5 seconds").
  useEffect(() => {
    if (!pace || revealed || !lastKeystrokeTime) return;

    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);

    const elapsed = Date.now() - lastKeystrokeTime;
    const remaining = pacedecay * 1000 - elapsed;

    if (remaining <= 0) {
      if (valueRef.current.length > 0) setRevealed(true);
      return;
    }

    lockTimeoutRef.current = setTimeout(() => {
      if (valueRef.current.length > 0) setRevealed(true);
    }, remaining);

    return () => {
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = null;
      }
    };
  }, [pace, revealed, lastKeystrokeTime, pacedecay, setRevealed]);

  // Blur textarea when revealed
  useEffect(() => {
    if (revealed && textareaRef.current) {
      textareaRef.current.blur();
    }
  }, [revealed]);

  // In nodelete mode, force cursor to end after each change
  useEffect(() => {
    if (!nodelete || !textareaRef.current) return;
    const ta = textareaRef.current;
    const len = value.length;
    if (ta.selectionStart !== len || ta.selectionEnd !== len) {
      ta.selectionStart = len;
      ta.selectionEnd = len;
    }
  }, [nodelete, value]);

  // Textarea change handler
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    // In nodelete mode, reject any change that shortens the text.
    // Known issues:
    //   - Drag-to-rearrange (same length, different content) passes the check.
    //   - IME composition (CJK input) may temporarily shrink the controlled value,
    //     causing legitimate input to be rejected. Needs a fix using compositionStart/
    //     compositionEnd events to suspend the length check during composition.
    if (nodelete && newValue.length < valueRef.current.length) return;
    // Only reset pace timer on non-whitespace input (no gaming with spacebar)
    const oldNonWS = valueRef.current.replace(/\s/g, '').length;
    const newNonWS = newValue.replace(/\s/g, '').length;
    setValue(newValue);
    if (newNonWS > oldNonWS) setLastKeystrokeTime(Date.now());
  }, [nodelete, setValue, setLastKeystrokeTime]);

  // Keyboard handler (prevents Backspace/Delete/Cut for immediate feedback)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!nodelete) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault();
    }
  }, [nodelete]);

  // In nodelete mode, force cursor to end on click/focus
  const handleSelect = useCallback(() => {
    if (!nodelete || !textareaRef.current) return;
    const ta = textareaRef.current;
    const len = valueRef.current.length;
    if (ta.selectionStart !== len || ta.selectionEnd !== len) {
      ta.selectionStart = len;
      ta.selectionEnd = len;
    }
  }, [nodelete]);

  // ── Render ──

  const words = countWords(value);
  const hidden = invisible && !revealed;

  // Build mode indicator labels
  const modes: string[] = [];
  if (hidden) modes.push('Text hidden');
  if (nodelete) modes.push('No erasing');

  const textareaClasses = [
    'lo-freewrite__textarea',
    hidden ? 'lo-freewrite__textarea--invisible' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="lo-freewrite">
      {/* Mode indicators */}
      {modes.length > 0 && (
        <div className="lo-freewrite__modes">
          {modes.map(mode => (
            <span key={mode} className="lo-freewrite__mode-badge">{mode}</span>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className={textareaClasses}
        value={value}
        onChange={revealed ? undefined : handleChange}
        onKeyDown={revealed ? undefined : handleKeyDown}
        onSelect={revealed ? undefined : handleSelect}
        readOnly={revealed}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autofocus && !revealed}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
      />

      {/* Reveal button (opt-in via reveal="true", hidden once clicked) */}
      {reveal && !revealed && (
        <div className="lo-freewrite__reveal">
          <button
            className="lo-freewrite__reveal-button"
            onClick={() => setRevealed(true)}
          >
            Reveal
          </button>
        </div>
      )}

      {/* Status bar: word count and/or pace indicator */}
      {(counter || (pace && !revealed)) && (
        <div className={`lo-freewrite__status${hidden && counter ? ' lo-freewrite__status--prominent' : ''}`}>
          {pace && !revealed && lastKeystrokeTime && (
            <div className="lo-freewrite__pace">
              <div
                key={lastKeystrokeTime}
                className="lo-freewrite__pace-bar"
                style={{ animationDuration: `${pacedecay}s` }}
              />
            </div>
          )}
          {counter && (
            <div className="lo-freewrite__wordcount">
              {words} {words === 1 ? 'word' : 'words'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default _Freewrite;
