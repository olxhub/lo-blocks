// OnChange - fires related actions whenever a watched value CHANGES.
//
// `Trigger` is edge-triggered on truth: it fires once on false→true and stays
// quiet while true. That is the wrong shape for keeping a grader current, because
// the thing being watched is not a condition that becomes true — it is a value
// that keeps changing as the student types, and every new value needs grading.
//
// The case this exists for: Handout 3's 1b and Handout 2's T1/T2 are scored
// entirely from the student's fields, so there is nothing for them to submit and
// no sensible button to press. A grader only runs when something executes its
// action, so without this they would publish verdicts and never be scored.
//
// Grading whenever the sheet changes was chosen over hooking navigation. A
// grader has to be MOUNTED to fire, and Sequential renders only the current
// child, so an on-leave or on-arrival hook cannot reach the screen being left.
// Re-grading in place has no such dependency and cannot go stale.
//
//   <DerivedChecks id="data_checks" ... />
//   <SlotSheetGrader id="data_grader" target="data_checks" />
//   <OnChange watch="@data_checks.checks" target="data_grader" />

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { z_expression } from '@/lib/blocks/attributeSchemas';
import { z_stateRefList } from '@/lib/blocks/attributeSchemas';
import _OnChange from './_OnChange';

export const fields = state.fields([
  { name: 'prevValue', scope: 'component' },
]);

const OnChange = dev({
  ...parsers.blocks(),
  name: 'OnChange',
  description: 'Fires related actions whenever a watched value changes (not just when it becomes true)',
  component: _OnChange,
  fields,
  attributes: z.object({
    watch: z_expression.describe('DSL expression whose VALUE is watched (e.g. "@sheet.checks")'),
    target: z_stateRefList.optional().describe(
      'Action block ID(s) to fire, comma-separated; inferred from context if omitted'
    ),
  }).strict(),
});

export default OnChange;
