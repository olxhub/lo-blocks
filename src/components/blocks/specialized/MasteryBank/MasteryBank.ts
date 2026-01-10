// src/components/blocks/specialized/MasteryBank/MasteryBank.js
//
// A mastery-based practice block that presents problems from a bank
// until the student achieves a streak of correct answers.
//
// Usage:
//   <MasteryBank id="quiz" goal="6">
//     problem_id_1, problem_id_2, problem_id_3
//   </MasteryBank>
//
// Or with external file:
//   <MasteryBank id="quiz" goal="6" src="problem_ids.idlistpeg" />

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import * as idListParser from './_idlistParser';
import _MasteryBank from './_MasteryBank';

export const fields = state.fields([
  'correctStreak',          // Current streak of correct answers
  'modeState',              // Mode-specific state (number for linear, object for shuffle)
  'completed',              // Internal: whether mastery has been achieved
  'firstSubmissionResult',  // First submission result: null, correctness.correct, or correctness.incorrect
  'attemptNumber',          // Increments when looping through all problems, scopes child state
  // TODO: Semantically, MasteryBank completion is "doneness" not "correctness" - the student
  // finished the task, but there's no right/wrong answer for the block itself. We don't yet
  // have a doneness/completion field convention in the system. Using `correct` for now since
  // that's what external components (graders, progress tracking) expect to watch.
  'correct'                 // Exported for external tracking (mirrors `completed`)
]);

const MasteryBank = dev({
  ...peggyParser(idListParser, {
    postprocess: ({ parsed }) => {
      // parsed is an array of problem IDs
      return { type: 'parsed', problemIds: parsed };
    }
  }),
  name: 'MasteryBank',
  description: 'Mastery-based practice: present random problems until N correct in a row',
  component: _MasteryBank,
  fields,
  attributes: srcAttributes.extend({
    goal: z.coerce.number().optional().describe('Number of correct answers in a row to achieve mastery (default: 6)'),
    mode: z.enum(['linear', 'shuffle']).optional().describe('Problem selection mode (default: linear)'),
  }),
});

export default MasteryBank;
