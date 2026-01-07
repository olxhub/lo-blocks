// src/components/blocks/test/_DevQuestion.jsx
'use client';

import React from 'react';
// DebugWrapper handles debug output

import { useReduxState } from '@/lib/state';

export function _DevQuestion( props ) {
  const { prompt, options = [], fields } = props;
  const optionList = typeof options === 'string' ? options.split(',') : options;
  const [activeIndex, setActiveIndex] = useReduxState(
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
                className={`px-3 py-1 rounded hover:bg-gray-300 ${
                  isActive ? 'bg-blue-500 text-white' : 'bg-gray-200'
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
