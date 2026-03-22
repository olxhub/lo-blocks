'use client';

// src/components/common/StatePanel.tsx
//
// Collapsible panel showing Redux component state.
// Used in docs page to help developers see component state during demos.
//
// Discovers state entries from Redux (the dynamic DOM), not from idMap
// (the static content). This means scoped entries (e.g. DynamicList items,
// Annotate notes) appear automatically as they're created.

import React, { useState } from 'react';
import { useSelector } from 'react-redux';

/**
 * Single state viewer row - shows a Redux component state key and its value.
 */
function StateRow({ reduxKey }: { reduxKey: string }) {
  const componentState = useSelector(
    (state: any) => state?.application_state?.component?.[reduxKey] || null,
  );

  return (
    <div className="border-b last:border-b-0 py-2">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <code className="font-semibold text-gray-700">{reduxKey}</code>
      </div>
      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
        {componentState === null
          ? <span className="text-gray-400 italic">no state</span>
          : JSON.stringify(componentState, null, 2)
        }
      </pre>
    </div>
  );
}

function StateRows({ keys }: { keys: string[] }) {
  const componentStates = useSelector(
    (state: any) => state?.application_state?.component,
  );

  const sorted = [...keys].sort((a, b) => {
    const sizeA = JSON.stringify(componentStates?.[a] ?? null).length;
    const sizeB = JSON.stringify(componentStates?.[b] ?? null).length;
    return sizeB - sizeA;
  });

  return (
    <div className="p-3 bg-white max-h-64 overflow-y-auto">
      {sorted.map(key => (
        <StateRow key={key} reduxKey={key} />
      ))}
    </div>
  );
}

/**
 * Collapsible panel showing all Redux component state entries.
 */
export default function StatePanel() {
  const [expanded, setExpanded] = useState(false);

  const componentKeys = useSelector(
    (state: any) => Object.keys(state?.application_state?.component ?? {}),
    (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])
  );

  if (componentKeys.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 bg-gray-100 border-b text-left text-sm flex items-center justify-between hover:bg-gray-200 transition-colors"
      >
        <span className="font-medium text-gray-700">
          State ({componentKeys.length})
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <StateRows keys={componentKeys} />
      )}
    </div>
  );
}
