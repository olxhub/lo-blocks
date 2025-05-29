'use client';

import React, { useState } from 'react';
import { Trace } from '@/lib/debug';

import { useReduxState } from '@/lib/blocks';

export function _QuestionBlock({ prompt, url_name, id, options = [], fields }) {
  const optionList = typeof options === 'string' ? options.split(',') : options;
  const [activeIndex, setActiveIndex] = useReduxState(
    id,
    // spec.fieldToEventMap.fields.activeIndex also works
    //
    // We might want a more concise version of this, e.g. pass in fields
    // directly, but perhaps once this matures a bit more.
    fields.activeIndex
  );

  return (
    <div className="p-4 border rounded">
      <Trace>
        [QuestionBlock / (url_name: {url_name || 'n/a'}) / (id: {id || 'n/a'})]
      </Trace>
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
