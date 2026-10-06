// packages/shared/components/blocks/grading/ScoreTable/ScoreTable.ts
//
// What each item scored, and what the handout came to.
//
// The pieces already exist and are already trusted: every graded item publishes
// its filled sheet, and `scoreSlotSheet` turns a sheet into {score, max}. What
// was missing was somewhere to see them together — a student finishing a handout
// could read eight separate feedback panels and still not know their total.
//
//   <ScoreTable id="bmod_h1_scores"
//               items="bmod_h1_q1_feedback:1. Defining the behavior|
//                      bmod_h1_q2_feedback:2. Wanted goal behavior" />
//
// Scores are computed from the sheets rather than read off the graders. A
// grader's `score` field is a FRACTION of its own max, so rendering points from
// it means multiplying by a maximum this block would have to be told separately
// — a second copy of every item's total, authored by hand, free to drift from
// the sheet it describes. Going through `scoreSlotSheet` means the table and the
// grader cannot disagree, because they are the same arithmetic over the same
// data.
//
// An item with no sheet yet is not zero. It is unanswered, shown as "—", and it
// still contributes its maximum to the total available — otherwise the
// denominator would grow as the student worked, and a handout half done would
// claim a better ratio than one finished.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import * as state from '@/lib/state';
import _ScoreTable from './_ScoreTable';

export const fields = state.fields([]);

const ScoreTable = dev({
  ...ignore(),
  name: 'ScoreTable',
  description:
    "Shows each graded item's points scored and points available, with the " +
    'handout total underneath.',
  component: _ScoreTable,
  fields,
  attributes: z.object({
    items: z.string().describe(
      'The rows, separated by "|", each `sheetId:Label`. The id is whatever ' +
      'published the sheet — an LLMFeedback or a DerivedChecks — and the label ' +
      'is the heading the student already knows the item by.'
    ),
    heading: z.string().optional().describe(
      'Column heading for the first column (default "Question").'
    ),
  }).strict(),
});

export default ScoreTable;
