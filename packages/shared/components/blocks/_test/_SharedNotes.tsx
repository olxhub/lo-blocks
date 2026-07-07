// packages/shared/components/blocks/_test/_SharedNotes.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';

export default function SharedNotes(props: RuntimeProps) {
  const { fields } = props;
  const [notes, setNotes] = useFieldState(props, fields.notes, '');

  return (
    <div className="p-4 border rounded">
      <div className="text-sm text-muted-foreground mb-1">
        Shared notes — everyone sees and edits the same value
      </div>
      <textarea
        className="w-full border rounded p-2"
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </div>
  );
}
