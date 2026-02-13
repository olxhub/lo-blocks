// src/components/blocks/reference/AggregatedInputs/_AggregatedInputs.jsx
'use client';

import React, { useMemo } from 'react';
import { inferRelatedNodes, getDomNodeByReduxKey } from '@/lib/blocks/olxdom';
import { refToReduxKey } from '@/lib/blocks/idResolver';
import { useAggregate, componentFieldByName } from '@/lib/state';

function normalizeTargets(rawTargets) {
  if (!rawTargets) return [];

  if (Array.isArray(rawTargets)) {
    return rawTargets.filter(Boolean);
  }

  if (typeof rawTargets === 'string') {
    return rawTargets
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean);
  }

  return [];
}

function resolveTargetIds(props, targetIds) {
  const results: any[] = [];
  const seen = new Set();

  targetIds.forEach((targetId) => {
    // OlxKey → ReduxStateKey (applies runtime.idPrefix for DynamicList scoping)
    const targetNodeInfo = getDomNodeByReduxKey(props, refToReduxKey({ id: targetId, idPrefix: props.runtime?.idPrefix }));

    const graderIds = targetNodeInfo
      ? inferRelatedNodes(
          { ...props, nodeInfo: targetNodeInfo },
          {
            selector: (nodeInfo) => nodeInfo.loBlock.isGrader,
            infer: ['kids'],
            targets: undefined
          }
        )
      : [];

    const idsToUse = graderIds.length > 0 ? graderIds : [targetId];

    idsToUse.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      results.push(id);
    });
  });

  return results;
}

/**
 * Simple visualization component for the useAggregate hook.
 *
 * Provide one or more target IDs and a field name (default: "value"). The
 * hook reads the same field across each target and renders the results in a
 * list for quick inspection.
 */
export function _AggregatedInputs(props) {
  const {
    target,
    field = 'value',
    fallback = '',
    aggregate,
    asObject = false,
    heading = 'Aggregated state values'
  } = props;

  const targetIds = useMemo(
    () => normalizeTargets(target),
    [target]
  );

  const resolvedTargetIds = useMemo(
    () => resolveTargetIds(props, targetIds),
    [props, targetIds]
  );

  if (resolvedTargetIds.length === 0) {
    return (
      <pre className="text-red-500">
        [useAggregate requires at least one target id]
      </pre>
    );
  }

  // Validate that each target exposes the requested field; use the first
  // field reference for the hook invocation.
  const fieldInfo = componentFieldByName(props, resolvedTargetIds[0], field);
  resolvedTargetIds.slice(1).forEach((id) => componentFieldByName(props, id, field));

  const aggregateMode = aggregate ?? (asObject ? 'object' : 'list');
  const values = useAggregate(props, fieldInfo, resolvedTargetIds, { fallback, aggregate: aggregateMode });

  const entries = Array.isArray(values)
    ? resolvedTargetIds.map((id, index) => [id, values[index]])
    : values && typeof values === 'object'
      ? Object.entries(values)
      : [['aggregate', values]];

  return (
    <div className="space-y-2">
      <div className="font-semibold">{heading}</div>
      <ul className="list-disc pl-4">
        {entries.map(([id, value]) => (
          <li key={id}>
            <span className="font-mono">{id}</span>: <span>{String(value ?? fallback ?? '')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default _AggregatedInputs;