'use client';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useKids, useKidsJson } from '@/lib/render';

// Render the single assigned child
function SplitTestChild({ props, node }) {
  const { kids } = useKids({ ...props, kids: [node] });
  return <>{kids}</>;
}

/**
 * Pick a group index based on weights.
 * weights is an array like [0.5, 0.25, 0.25]. A random roll in [0,1)
 * determines the group. If no weights, uniform distribution.
 */
function pickGroup(numGroups: number, weights?: number[]): number {
  if (numGroups <= 0) return 0;

  const roll = Math.random();

  if (weights && weights.length === numGroups) {
    // Normalize weights
    const total = weights.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i] / total;
      if (roll < cumulative) return i;
    }
    return numGroups - 1; // Floating point safety
  }

  // Uniform
  return Math.floor(roll * numGroups);
}

function parseWeights(weightsStr: string | undefined): number[] | undefined {
  if (!weightsStr) return undefined;
  const parts = weightsStr.split(',').map(s => parseFloat(s.trim()));
  if (parts.some(isNaN)) return undefined;
  return parts;
}

function parseGroups(groupsStr: string | undefined): string[] | undefined {
  if (!groupsStr) return undefined;
  return groupsStr.split(',').map(s => s.trim()).filter(Boolean);
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

export default function _SplitTest(props) {
  const { fields, attributes } = props;
  const blockId = attributes?.id || 'split_test';
  const targetId = attributes?.target;
  const groupNames = parseGroups(attributes?.groups);
  const weights = parseWeights(attributes?.weights);

  const kidsJson = useKidsJson(props);
  const numGroups = kidsJson.length;

  // Read own stored group assignment
  const [storedValue, setStoredValue] = useFieldState(props, fields.value, null);

  // If target is set, read the master's group assignment
  // TODO: When we have hash-based assignment (userId + experimentId), use that
  // instead of random for deterministic reproducibility.
  const [masterValue] = useFieldState(
    targetId ? props : null,
    fields.value,
    null,
    targetId ? { id: targetId } : {},
  );

  // Determine which value to use: master's if following, own otherwise
  const effectiveValue = targetId ? masterValue : storedValue;

  // Resolve the group ID to an index
  let groupIndex: number | null = null;
  if (effectiveValue !== null && effectiveValue !== undefined) {
    // Try to parse the index from the stored group ID
    const parts = String(effectiveValue).split(':');
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < numGroups) {
      groupIndex = parsed;
    }
  }

  // If no valid assignment yet and we're the master (or standalone), assign one
  if (groupIndex === null && !targetId && numGroups > 0) {
    const newIndex = pickGroup(numGroups, weights);
    const newGroupId = makeGroupId(blockId, newIndex, groupNames);
    // Persist to Redux (will be called on first render)
    if (storedValue !== newGroupId) {
      setStoredValue(newGroupId);
    }
    groupIndex = newIndex;
  }

  // Clamp to valid range
  if (groupIndex === null || groupIndex < 0 || groupIndex >= numGroups) {
    groupIndex = 0;
  }

  const currentChild = numGroups > 0 ? kidsJson[groupIndex] : null;

  if (!currentChild) return null;

  return (
    <div>
      <SplitTestChild props={props} node={currentChild} />
    </div>
  );
}
