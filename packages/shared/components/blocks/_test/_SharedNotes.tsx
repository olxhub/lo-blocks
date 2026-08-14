// packages/shared/components/blocks/_test/_SharedNotes.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useInputField } from '@/lib/state';

/**
 * Just useInputField — per-field levels make it correct without ceremony:
 * the VALUE is level 'everyone' (one text for the group), but the
 * selection extras useInputField tracks are the caller's CURSOR, which
 * updateField routes to their own level-user copy (redux.ts) — so cursor
 * restoration works and nobody shares a caret.
 */
export default function SharedNotes(props: RuntimeProps) {
  const { fields } = props;
  const [, inputProps] = useInputField(props, fields.notes, '');

  return (
    <div className="p-4 border rounded">
      <div className="text-sm text-muted-foreground mb-1">
        Shared notes — everyone sees and edits the same document
      </div>
      <textarea
        {...inputProps}
        className="w-full border rounded p-2"
        rows={4}
      />
    </div>
  );
}
