// packages/shared/components/blocks/layout/Sequential/Sequential.ts

import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { advanceChildren, canAdvanceChildren } from '@/lib/advance';
import { selectKidsJson } from '@/lib/render';
import type { RuntimeProps } from '@/lib/types';
import _Sequential from './_Sequential';

export const fields = state.fields([
  { name: 'index', scope: 'component' }  // Current sequence index
]);

/* ----------------------------------------------------------------
 * Advance / canAdvance
 *
 * Uses selectKidsJson to apply when= filtering — same filtered list
 * the UI renders against.  renderedKids contains only the current
 * child; advanceChildren handles the child walk; we add "move to
 * next step" as our own fallback.
 * -------------------------------------------------------------- */

function sequentialCanAdvance(props: RuntimeProps, reduxState: any): boolean {
  const filteredKids = selectKidsJson(props, reduxState);
  if (filteredKids.length === 0) return false;

  if (canAdvanceChildren(props.nodeInfo, reduxState)) return true;

  const index = state.fieldSelector(reduxState, props, fields.index, { fallback: 0 });
  return index < filteredKids.length - 1;
}

function sequentialAdvance(props: RuntimeProps, reduxState: any): boolean {
  const filteredKids = selectKidsJson(props, reduxState);
  if (filteredKids.length === 0) return false;

  if (advanceChildren(props.nodeInfo, reduxState)) return true;

  const index = state.fieldSelector(reduxState, props, fields.index, { fallback: 0 });
  if (index < filteredKids.length - 1) {
    state.updateField(props, fields.index, index + 1);
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
