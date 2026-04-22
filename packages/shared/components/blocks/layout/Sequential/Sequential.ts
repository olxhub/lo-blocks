// packages/shared/components/blocks/layout/Sequential/Sequential.ts

import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { refToReduxKey } from '@/lib/blocks/idResolver';
import { advanceFrom, canAdvanceFrom } from '@/lib/advance';
import type { RuntimeProps } from '@/lib/types';
import _Sequential from './_Sequential';

export const fields = state.fields([
  { name: 'index', scope: 'component' }  // Current sequence index
]);

/* ----------------------------------------------------------------
 * Advance / canAdvance
 *
 * Sequential tries its current child first (depth-first), then
 * advances itself to the next step when the child is done.
 *
 * Note: when= filtering is not applied here — we use props.kids
 * directly. This matches the common case; when=-filtered Sequential
 * children would need the imperative equivalent of useKidsJson.
 * -------------------------------------------------------------- */

function findCurrentChildNode(props: RuntimeProps, index: number) {
  const kids = (props.kids || []) as any[];
  const kid = kids[index];
  if (!kid) return null;

  const kidId = kid.id ?? kid.tag;
  if (!kidId) return null;

  const reduxKey = refToReduxKey({ id: kidId, idPrefix: props.runtime.idPrefix });
  return props.nodeInfo?.renderedKids?.[reduxKey] ?? null;
}

function sequentialCanAdvance(props: RuntimeProps, reduxState: any): boolean {
  const numItems = ((props.kids || []) as any[]).length;
  if (numItems === 0) return false;

  const index = state.fieldSelector(reduxState, props, fields.index, { fallback: 0 });
  const clampedIndex = Math.min(index, numItems - 1);

  // Current child can advance?
  const childNode = findCurrentChildNode(props, clampedIndex);
  if (childNode && canAdvanceFrom(childNode, reduxState)) return true;

  // More steps remaining?
  return clampedIndex < numItems - 1;
}

function sequentialAdvance(props: RuntimeProps, reduxState: any): boolean {
  const numItems = ((props.kids || []) as any[]).length;
  if (numItems === 0) return false;

  const index = state.fieldSelector(reduxState, props, fields.index, { fallback: 0 });
  const clampedIndex = Math.min(index, numItems - 1);

  // Try current child first (depth-first)
  const childNode = findCurrentChildNode(props, clampedIndex);
  if (childNode && advanceFrom(childNode, reduxState)) return true;

  // Child is done — advance to next step
  if (clampedIndex < numItems - 1) {
    state.updateField(props, fields.index, clampedIndex + 1);
    return true;
  }

  return false;
}

const Sequential = core({
  ...parsers.blocks(),
  name: 'Sequential',
  description: 'Linear step-through showing one piece of content at a time, with guided, sequential navigation',
  component: _Sequential,
  fields,
  advance: sequentialAdvance,
  canAdvance: sequentialCanAdvance,
});

export default Sequential;
