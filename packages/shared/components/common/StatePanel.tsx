'use client';

// src/components/common/StatePanel.tsx
//
// Collapsible panel showing Redux component state for the current preview.
// Used in docs page to help developers see component state during demos.
//
// Scopes state to the current preview by walking the dynamic OLX DOM tree
// (nodeInfo) to discover which ReduxStateKeys belong to this render tree.
// Each OlxDomNode carries its reduxKey and loBlock.fields, so we can both
// filter and decode state without BLOCK_REGISTRY lookups.
//
// TIMING: This component reads nodeInfoRef (a React ref) populated by
// RenderOLX during rendering. It relies on Redux state changes (via
// useSelector) to trigger re-renders, at which point the ref is read.
// This piggybacking avoids extra render cycles but has edge cases:
//   - First render: nodeInfo tree may be empty (no state to show anyway)
//   - Replay mode: state exists without live rendering (tree may be stale)
//   - Concurrent React: sibling render order not guaranteed
// See RenderOLX.tsx nodeInfoRef prop for full discussion.
// If these become real problems, switch to useEffect callback or context.

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { getKidsBFS } from '@/lib/blocks/olxdom';
import { decodeState } from '@/lib/state/stateDisplay';
import type { OlxDomNode, ReduxStateKey, FieldInfo } from '@/lib/types';

/** Info about a block in the nodeInfo tree, for state display. */
interface TreeEntry {
  reduxKey: ReduxStateKey;
  tag: string;
  fields: Record<string, FieldInfo> | undefined;
}

/**
 * Walk the nodeInfo tree and collect display info for each rendered block.
 * Excludes the sentinel root node (it has no real block state).
 */
function collectTreeEntries(root: OlxDomNode): TreeEntry[] {
  const nodes = getKidsBFS(root, {
    includeRoot: false,
    selector: (n: OlxDomNode) => n.sentinel !== 'root',
  });

  return nodes.map(n => ({
    reduxKey: n.reduxKey,
    tag: n.olxJson?.tag || '?',
    fields: n.loBlock?.fields as Record<string, FieldInfo> | undefined,
  }));
}

/**
 * Single state viewer row — shows decoded field state for one block.
 */
function StateRow({ entry }: { entry: TreeEntry }) {
  const componentState = useSelector(
    (state: any) => state?.application_state?.component?.[entry.reduxKey] || null,
  );

  if (componentState === null) return null;

  const { decoded, meta } = decodeState(componentState, entry.fields);
  const hasDecoded = Object.keys(decoded).length > 0;
  const hasMeta = Object.keys(meta).length > 0;

  return (
    <div className="border-b last:border-b-0 py-2">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <code className="font-semibold text-gray-700">{entry.reduxKey}</code>
        <span className="text-gray-400">{entry.tag}</span>
      </div>
      {hasDecoded && (
        <div className="text-xs bg-gray-50 p-2 rounded">
          {Object.entries(decoded).map(([name, display]) => (
            <div key={name}>
              <span className="text-gray-500">{name}: </span>
              <span>{display || <span className="text-gray-400 italic">(empty)</span>}</span>
            </div>
          ))}
        </div>
      )}
      {hasMeta && (
        <details className="mt-1">
          <summary className="text-xs text-gray-400 cursor-pointer">
            raw ({Object.keys(meta).length} metadata keys)
          </summary>
          <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto text-gray-500">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function StateRows({ entries }: { entries: TreeEntry[] }) {
  const componentStates = useSelector(
    (state: any) => state?.application_state?.component,
  );

  // Sort by state size (largest first) — stateless blocks like Markdown sink to bottom
  const sorted = [...entries].sort((a, b) => {
    const sizeA = JSON.stringify(componentStates?.[a.reduxKey] ?? null).length;
    const sizeB = JSON.stringify(componentStates?.[b.reduxKey] ?? null).length;
    return sizeB - sizeA;
  });

  return (
    <div className="p-3 bg-white max-h-64 overflow-y-auto">
      {sorted.map(entry => (
        <StateRow key={entry.reduxKey} entry={entry} />
      ))}
    </div>
  );
}

/**
 * Collapsible panel showing Redux component state scoped to the current preview.
 *
 * Reads the nodeInfo tree from a ref populated by RenderOLX. Walks the tree
 * to discover which ReduxStateKeys belong to this preview, then shows decoded
 * field state for each block that has state.
 */
export default function StatePanel({
  nodeInfoRef,
}: {
  nodeInfoRef?: React.RefObject<OlxDomNode | null>;
}) {
  const [expanded, setExpanded] = useState(false);

  // Walk the nodeInfo tree to find blocks in this preview.
  // The ref is populated by RenderOLX during rendering — see timing caveat above.
  const rootNodeInfo = nodeInfoRef?.current;
  const treeEntries = rootNodeInfo ? collectTreeEntries(rootNodeInfo) : [];
  const treeKeySet = new Set(treeEntries.map(e => e.reduxKey));

  // Subscribe to Redux state, filtering to keys in the nodeInfo tree
  const componentKeys = useSelector(
    (state: any) => {
      const allKeys = Object.keys(state?.application_state?.component ?? {});
      if (treeKeySet.size === 0) return allKeys;
      return allKeys.filter(k => treeKeySet.has(k as ReduxStateKey));
    },
    (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])
  );

  if (componentKeys.length === 0 && treeEntries.length === 0) {
    return null;
  }

  // Filter tree entries to only those with actual Redux state
  const activeEntries = treeEntries.filter(e =>
    componentKeys.includes(e.reduxKey)
  );

  return (
    <div className="border rounded-lg overflow-hidden mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 bg-gray-100 border-b text-left text-sm flex items-center justify-between hover:bg-gray-200 transition-colors"
      >
        <span className="font-medium text-gray-700">
          State ({activeEntries.length})
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
        <StateRows entries={activeEntries} />
      )}
    </div>
  );
}
