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
//   <MasteryBank id="quiz" goal="6" src="problem_ids.txt" />

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import * as idListParser from './_idlistParser.js';
import _MasteryBank from './_MasteryBank';

export const fields = state.fields([
  'currentIndex',           // Index into shuffled problem order
  'correctStreak',          // Current streak of correct answers
  'shuffledOrder',          // Randomized order of problem indices
  'completed',              // Whether mastery has been achieved
  'firstSubmissionResult'   // Result of first submission for current problem (null, 'correct', 'incorrect')
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
  fields
});

export default MasteryBank;
