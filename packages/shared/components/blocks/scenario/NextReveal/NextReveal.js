// src/components/blocks/layout/NextReveal/NextReveal.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { advanceFrom, canAdvanceFrom } from '@/lib/advance';
import _NextReveal from './_NextReveal';

export const fields = state.fields([
  { name: 'currentStep', scope: 'component' }  // Number of steps revealed
]);

/* ----------------------------------------------------------------
 * Advance / canAdvance
 *
 * renderedKids already contains only the revealed children (since
 * _NextReveal renders kids.slice(0, currentStep)).  So we just
 * walk renderedKids like a transparent container, then reveal the
 * next child if nothing advanced.
 * -------------------------------------------------------------- */

function nextRevealCanAdvance(props, reduxState) {
  for (const child of Object.values(props.nodeInfo?.renderedKids ?? {})) {
    if (canAdvanceFrom(child, reduxState)) return true;
  }
  const numItems = (props.kids || []).length;
  const currentStep = state.fieldSelector(reduxState, props, fields.currentStep, { fallback: 1 });
  return currentStep < numItems;
}

function nextRevealAdvance(props, reduxState) {
  // Try revealed children first (depth-first)
  for (const child of Object.values(props.nodeInfo?.renderedKids ?? {})) {
    if (advanceFrom(child, reduxState)) return true;
  }

  // All children done — reveal next
  const numItems = (props.kids || []).length;
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
