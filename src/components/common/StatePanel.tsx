'use client';

// src/components/common/StatePanel.jsx
//
// Collapsible panel showing Redux state for all stateful components in an idMap.
// Used in docs page to help developers see component state during demos.
//
// Warning: This is prototype code. May contain bugs, hacks, LLM slops, abstraction violations...
//
// If you run into issues with it, please do a cleanup. We need to merge a PR and we'll fix later.

import React, { useState, useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { COMPONENT_MAP } from '@/components/componentMap';
import type { OlxKey, OlxJson, IdMap } from '@/lib/types';

/**
 * Find all component IDs in idMap that have stateful fields.
 */
function findStatefulIds(idMap, componentMap = COMPONENT_MAP) {
  if (!idMap) return [];

  return Object.entries(idMap)
    .filter(([id, node]: [OlxKey, OlxJson]) => {
      const blockType = componentMap[node.tag];
      // Has fields defined = stateful (fields is the map of field name -> FieldInfo)
      const hasFields = blockType?.fields && Object.keys(blockType.fields).length > 0;
      return hasFields;
    })
    .map(([id]) => id);
}

/**
 * Single state viewer row - shows component ID and its state.
 */
function StateRow({ id, idMap }) {
  const componentState = useSelector(
    (state: any) => state?.application_state?.component?.[id] || null,
    shallowEqual
  );

  const node = idMap[id];
  const tag = node?.tag || '?';

  return (
    <div className="border-b last:border-b-0 py-2">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <code className="font-semibold text-gray-700">{id}</code>
        <span className="text-gray-400">({tag})</span>
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

/**
 * Collapsible panel showing state for all stateful components.
 */
export default function StatePanel({ idMap, componentMap = COMPONENT_MAP }) {
  const [expanded, setExpanded] = useState(false);

  const statefulIds = useMemo(
    () => findStatefulIds(idMap, componentMap),
    [idMap, componentMap]
  );

  if (statefulIds.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 bg-gray-100 border-b text-left text-sm flex items-center justify-between hover:bg-gray-200 transition-colors"
      >
        <span className="font-medium text-gray-700">
          State ({statefulIds.length})
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
        <div className="p-3 bg-white max-h-64 overflow-y-auto">
          {statefulIds.map(id => (
            <StateRow key={id} id={id} idMap={idMap} />
          ))}
        </div>
      )}
    </div>
  );
}
