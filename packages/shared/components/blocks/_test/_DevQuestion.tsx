// packages/shared/components/blocks/_test/_DevQuestion.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
// DebugWrapper handles debug output

import { useFieldState } from '@/lib/state';

export default function DevQuestion( props: RuntimeProps ) {
  const { prompt, options = [], fields } = props;
  const optionList = typeof options === 'string' ? options.split(',') : options;
  const [activeIndex, setActiveIndex] = useFieldState(
    props,
    fields.activeIndex,
    0
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
