// src/components/blocks/layout/NextReveal/NextReveal.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { advanceChildren, canAdvanceChildren } from '@/lib/advance';
import { selectKidsJson } from '@/lib/render';
import _NextReveal from './_NextReveal';

export const fields = state.fields([
  { name: 'currentStep', scope: 'component' }  // Number of steps revealed
]);

/* ----------------------------------------------------------------
 * Advance / canAdvance
 *
 * Uses selectKidsJson to apply when= filtering — same filtered list
 * the UI renders against.  renderedKids contains only the revealed
 * children; advanceChildren handles the child walk; we add "reveal
 * next" as our own fallback.
 * -------------------------------------------------------------- */

function nextRevealCanAdvance(props, reduxState) {
  if (canAdvanceChildren(props.nodeInfo, reduxState)) return true;
  const numItems = selectKidsJson(props, reduxState).length;
  const currentStep = state.fieldSelector(reduxState, props, fields.currentStep, { fallback: 1 });
  return currentStep < numItems;
}

function nextRevealAdvance(props, reduxState) {
  if (advanceChildren(props.nodeInfo, reduxState)) return true;

  const numItems = selectKidsJson(props, reduxState).length;
  const currentStep = state.fieldSelector(reduxState, props, fields.currentStep, { fallback: 1 });
  if (currentStep < numItems) {
    state.updateField(props, fields.currentStep, currentStep + 1);
    return true;
  }
  return false;
}

const NextReveal = core({
  ...parsers.blocks(),
  name: 'NextReveal',
  description: 'Progressive reveal container that shows children one at a time with Next buttons, scrolling to bottom on Next but allowing up-scrolling',
  component: _NextReveal,
  fields,
  advance: nextRevealAdvance,
  canAdvance: nextRevealCanAdvance,
});

export default NextReveal;
