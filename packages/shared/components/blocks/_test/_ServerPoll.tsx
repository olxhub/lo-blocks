// packages/shared/components/blocks/_test/_ServerPoll.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';

const OPTIONS = ['Alpha', 'Beta', 'Gamma'];

export default function ServerPoll(props: RuntimeProps) {
  const { fields } = props;
  const [counts, vote] = useFieldState(props, fields.counts, {});

  return (
    <div className="p-4 border rounded">
      <div className="text-sm text-muted-foreground mb-2">
        Aggregate poll — everyone's votes fold into one count
      </div>
      <div className="flex gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            className="px-3 py-1 rounded bg-muted hover:bg-accent"
            onClick={() => vote(opt)}
          >
            {opt} ({counts[opt] ?? 0})
          </button>
        ))}
      </div>
    </div>
  );
}
