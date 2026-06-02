'use client';
import type { RuntimeProps, StateRef } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { scopedStateKeyForBlock, stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import { useKids, useKidsJson } from '@/lib/render';

function SplitTestChild({ props, node }) {
  const { kids } = useKids({ ...props, kids: [node] });
  return <>{kids}</>;
}

/**
 * Pick a group index based on weights.
 * weights is an array like [0.5, 0.25, 0.25]. A random roll in [0,1)
 * determines the group. If no weights or invalid, uniform distribution.
 */
function pickGroup(numGroups: number, weights?: number[]): number {
  if (numGroups <= 0) return 0;

  if (weights && weights.length === numGroups) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return Math.floor(Math.random() * numGroups);

    const roll = Math.random();
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i] / total;
      if (roll < cumulative) return i;
    }
    return numGroups - 1; // Floating point safety
  }

  return Math.floor(Math.random() * numGroups);
}

function parseWeights(s: string | undefined): number[] | undefined {
  if (!s) return undefined;
  const parts = s.split(',').map(v => parseFloat(v.trim()));
  if (parts.some(isNaN)) return undefined;
  return parts;
}

function parseGroups(s: string | undefined): string[] | undefined {
  if (!s) return undefined;
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * Build a group ID from the block id, optional group name, and index.
 * e.g. "modality_exp:inquiry:0" or "modality_exp:1"
 */
function makeGroupId(blockId: string, index: number, groupNames?: string[]): string {
  if (groupNames && groupNames[index]) {
    return `${blockId}:${groupNames[index]}:${index}`;
  }
  return `${blockId}:${index}`;
}

/**
 * Parse a group index from a stored group ID like "modality_exp:inquiry:0" or "modality_exp:1".
 * Returns null if unparseable.
 */
function parseGroupIndex(value: unknown, numGroups: number): number | null {
  if (value === null || value === undefined) return null;
  const parts = String(value).split(':');
  const parsed = parseInt(parts[parts.length - 1], 10);
  if (isNaN(parsed) || parsed < 0 || parsed >= numGroups) return null;
  return parsed;
}

export default function _SplitTest(props: RuntimeProps) {
  const { fields, id } = props;
  const groupNames = parseGroups(props.groups);
  const weights = parseWeights(props.weights);

  const kidsJson = useKidsJson(props);
  const numGroups = kidsJson.length;

  // Symmetric: master reads/writes its own id, follower reads from master's id.
  // target defaults to self. Resolve through scopedStateKeyForBlock to apply scope (idPrefix).
  const targetStateKey = props.target
    ? stateKeyForGlobalRef(props.target as StateRef, props.runtime.ns)
    : scopedStateKeyForBlock(props);
  // TODO: When we have hash-based assignment (userId + experimentId), use that
  // instead of random for deterministic reproducibility.
  const [groupValue, setGroupValue] = useFieldState(props, fields.value, null, { stateKey: targetStateKey });

  let groupIndex = parseGroupIndex(groupValue, numGroups);

  // If no valid assignment, pick one and persist.
  // Only the master (target === self) should assign; followers wait.
  if (groupIndex === null && !props.target && numGroups > 0) {
    const newIndex = pickGroup(numGroups, weights);
    setGroupValue(makeGroupId(id, newIndex, groupNames));
    groupIndex = newIndex;
  }

  // Follower with no master assignment yet — render nothing until master assigns
  if (groupIndex === null) return null;

  const currentChild = kidsJson[groupIndex];
  if (!currentChild) return null;

  return (
    <div>
      <SplitTestChild props={props} node={currentChild} />
    </div>
  );
}
