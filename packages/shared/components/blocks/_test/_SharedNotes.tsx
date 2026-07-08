// packages/shared/components/blocks/_test/_SharedNotes.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useLayoutEffect, useRef } from 'react';
import { useFieldState } from '@/lib/state';

/**
 * Cursor management for a SHARED text field — the concrete case of one
 * block needing state at two levels: the TEXT is level 'everyone', but
 * the CURSOR is strictly local (useInputField's selection tracking would
 * put it in the same bucket — a shared cursor everyone fights over).
 * So: selection lives in a ref, restored after each render, and when a
 * REMOTE edit lands before the caret, the caret shifts by the length
 * delta (common-prefix heuristic — right for single-point edits, which
 * is all LWW whole-string replacement can represent anyway).
 */
export default function SharedNotes(props: RuntimeProps) {
  const { fields } = props;
  const [notes, setNotes] = useFieldState(props, fields.notes, '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const lastRendered = useRef('');

  useLayoutEffect(() => {
    const el = textareaRef.current;
    const prev = lastRendered.current;
    lastRendered.current = notes;
    if (!el || document.activeElement !== el) return;

    let { start, end } = selection.current;
    if (prev !== notes) {
      // Where did the change happen relative to the caret? If entirely
      // before it (change point < caret), shift by the length delta so
      // the caret stays on the same text.
      let changeAt = 0;
      const max = Math.min(prev.length, notes.length);
      while (changeAt < max && prev[changeAt] === notes[changeAt]) changeAt++;
      if (changeAt < start) {
        const delta = notes.length - prev.length;
        start = Math.max(changeAt, start + delta);
        end = Math.max(changeAt, end + delta);
      }
    }
    el.setSelectionRange(start, end);
  }, [notes]);

  const track = (el: HTMLTextAreaElement) => {
    selection.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  return (
    <div className="p-4 border rounded">
      <div className="text-sm text-muted-foreground mb-1">
        Shared notes — everyone sees and edits the same value
      </div>
      <textarea
        ref={textareaRef}
        className="w-full border rounded p-2"
        rows={4}
        value={notes}
        onChange={(e) => { track(e.target); setNotes(e.target.value); }}
        onSelect={(e) => track(e.currentTarget)}
        onKeyUp={(e) => track(e.currentTarget)}
        onClick={(e) => track(e.currentTarget)}
      />
    </div>
  );
}
