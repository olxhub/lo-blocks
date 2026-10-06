// packages/shared/components/blocks/grading/SheetValue/SheetValue.ts
//
// Exposes one value out of a published slot sheet as a field others can read.
//
// An LLMAction publishes its filled sheet to the target's `checks` field as
// JSON: the slot specs, and per check a verdict, the evidence that settled it,
// and the note the student reads. Everything in there is already a judgement the
// model made and the grader trusts — but it is trapped, because `checks` is a
// JSON string and the state language has no way into it. A screen that wants to
// SHOW what the model concluded has to ask a second model, which is both a
// second cost and a second opinion that can contradict the first.
//
// Handout 1 is the case. Question 1 asks the student to state their unwanted
// target behaviour in their own words, and `utb_stated`'s evidence is the span
// that settles it — the behaviour as the student actually wrote it. Later screens
// want to say "your unwanted target behaviour was ..." and had been echoing the
// radio button from the first screen instead, which is what they PICKED, not what
// they went on to write about.
//
//   <SheetValue id="bmod_h1_utb_observed"
//               target="bmod_h1_q1_feedback"
//               check="utb_stated" part="evidence"
//               fallback="bmod_h1_utb" />
//
// Renders nothing, and writes to its own `value`, which persists — so it only
// has to be MOUNTED where the sheet is published (Sequential renders one child
// at a time), and every later screen reads the stored value.
//
// `fallback` matters more than it looks: a student who has not pressed the check
// button yet has no sheet, and a screen that then says "your unwanted target
// behaviour was: " with nothing after it is worse than one naming their choice.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import _SheetValue from './_SheetValue';

export const fields = state.fields(['value']);

const SheetValue = dev({
  ...ignore(),
  name: 'SheetValue',
  description:
    'Reads one check\'s verdict or evidence out of a published slot sheet and ' +
    'exposes it as a value other blocks can display or reference. Renders nothing.',
  component: _SheetValue,
  fields,
  attributes: z.object({
    target: z_stateRef.describe(
      'ID of the LLMFeedback (or DerivedChecks) whose published sheet to read',
    ),
    check: z.string().describe('Which check in the sheet, by its slot key'),
    part: z.enum(['evidence', 'verdict', 'note']).default('evidence').describe(
      'Which half of that check to expose: the span that settled it (evidence), ' +
      'the answer itself (verdict), or the sentence written for the student (note).',
    ),
    fallback: z_stateRef.optional().describe(
      'ID of a component whose value to use until the sheet exists. Without one, ' +
      'this is empty until the student has pressed the button that fills the sheet.',
    ),
    strip: z.enum(['true', 'false']).optional().describe(
      'Remove surrounding quotation marks from the value (default true). Evidence ' +
      'is authored as a quotation; a value being dropped into a sentence of its ' +
      'own usually wants the marks gone.',
    ),
  }).strict(),
});

export default SheetValue;
