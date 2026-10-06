// packages/shared/components/blocks/grading/DerivedChecks/DerivedChecks.ts
//
// Publishes a gradeable slot sheet whose verdicts come from the page, not a model.
//
// SlotSheetGrader scores a sheet; until now the only thing that produced one was
// LLMAction, so an item whose verdicts are pure facts about the student's fields
// could not be graded through the normal path at all. Handout 3's 1b is exactly
// that: a point per week of data present, "a presence check, not a quality
// judgement". It was being reported to the student by the chart and scored
// nowhere.
//
//   <DerivedChecks id="data_checks"
//                  slots="baseline:Baseline week's data present@1|wk1:Week 1 data present@1"
//                  derived="baseline:field_baseline|wk1:field_wk1" />
//   <SlotSheetGrader target="data_checks" />
//
// It carries its own `checks` field rather than writing to an LLMFeedback, so an
// item with nothing for a model to say does not need a feedback block it would
// leave empty.
//
// Renders nothing. The sheet is republished whenever the watched fields change,
// so the grader always reads current verdicts without the student pressing
// anything — there is no call to make and nothing to wait for.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import * as state from '@/lib/state';
import _DerivedChecks from './_DerivedChecks';

export const fields = state.fields(['checks']);

const DerivedChecks = dev({
  ...ignore(),
  name: 'DerivedChecks',
  description:
    'Publishes a slot sheet whose verdicts are read off the page rather than asked ' +
    'of a model, for SlotSheetGrader to score. Renders nothing.',
  component: _DerivedChecks,
  fields,
  attributes: z.object({
    slots: z.string().describe(
      'The checklist, same syntax as LLMAction: `key:Label:opt/opt@pts`, separated by "|".'
    ),
    verdicts: z.string().optional().describe(
      'Default verdict vocabulary for checks that do not name their own, comma-separated.'
    ),
    derived: z.string().describe(
      'Which checks are read off the page, and from where. Rules separated by "|", ' +
      'each `key:ref,ref` or `key:ref,ref:template;data`. Every scored check should ' +
      'have a rule — a check with no rule has no verdict and would score as unmet.'
    ),
    max: z.string().optional().describe(
      "The item's total, when the checks' costs deliberately do not sum to it."
    ),
  }).strict(),
});

export default DerivedChecks;
