// packages/shared/components/blocks/_test/_DevQuestion.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
// DebugWrapper handles debug output

import { useFieldState } from '@/lib/state';

export default function DevQuestion( props: RuntimeProps ) {
  const { prompt, options = [], fields } = props;
  const optionList = typeof options === 'string' ? options.split(',') : options;
  // Fallback -1 = "nothing picked yet", NOT a fake selection of option 0.
  // The default is a client-side read fallback that is never dispatched
  // (useFieldState never writes it), so a default of 0 would show "option
  // 0 selected" while the server sees no value. That mismatch breaks
  // grouped-by (partitions.ts groupFor): the picker is a grouping key, so
  // "no server value" MUST mean "unpartitioned (ALL)" on both sides —
  // the client can't display membership in a group the server doesn't
  // know about. Picking commits activeIndex, which joins the group.
  const [activeIndex, setActiveIndex] = useFieldState(
    props,
    fields.activeIndex,
    -1
  );

  return (
    <div className="p-4 border rounded">
      <p className="mb-2">Prompt: {prompt}</p>
      <ul>
        {optionList.map((opt, i) => {
          const isActive = i === activeIndex;
          return (
            <li key={i} className="mb-1">
              <button
                onClick={() => setActiveIndex(i)}
                className={`px-3 py-1 rounded hover:bg-muted ${
                  isActive ? 'bg-accent text-inverse' : 'bg-muted'
                }`}
              >
                {opt.trim()}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
