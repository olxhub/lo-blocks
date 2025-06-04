'use client';

import React, { useState } from 'react';
// DebugWrapper handles debug output

import { useReduxState } from '@/lib/blocks';

export function _QuestionBlock( props ) {
  const { debug, prompt, options = [], fields } = props;
  const optionList = typeof options === 'string' ? options.split(',') : options;
  const [activeIndex, setActiveIndex] = useReduxState(
    props,
    // spec.fieldToEventMap.fields.activeIndex also works
    //
    // We might want a more concise version of this, e.g. pass in fields
    // directly, but perhaps once this matures a bit more.
    fields.activeIndex
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
