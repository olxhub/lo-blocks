// src/components/blocks/TabularMCQ/TabularMCQGrader.js
//
// Grader for TabularMCQ - checks selections against expected answers.
//
// Usage:
//   <TabularMCQGrader target="mcq_input">
//     <TabularMCQ id="mcq_input">
//     cols: Noun, Verb, Adjective
//     rows: Dog[Noun], Run[Verb], Happy[Adjective]
//     </TabularMCQ>
//   </TabularMCQGrader>
//
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { core, CORRECTNESS } from '@/lib/blocks';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';

export const fields = state.fields(['correct', 'message', 'score']);

function gradeTabularMCQ(props, { input, inputApi }) {
  const answers = inputApi.getAnswers();
  const rows = inputApi.getRows();

  // Count how many rows have expected answers
  const gradedRows = rows.filter(row => row.answer !== null);
  const total = gradedRows.length;

  if (total === 0) {
    // No rows to grade - survey mode
    return {
      correct: CORRECTNESS.UNGRADED,
      message: 'This is a survey - no correct answers defined.',
      score: 0
    };
  }

  // Count correct answers
  let correct = 0;
  gradedRows.forEach(row => {
    const expected = answers[row.id];
    const selected = input[row.id];
    if (selected === expected) {
      correct++;
    }
  });

  const allCorrect = correct === total;
  const score = total > 0 ? correct / total : 0;

  return {
    correct: allCorrect ? CORRECTNESS.CORRECT : CORRECTNESS.INCORRECT,
    message: allCorrect ? '' : `${correct} of ${total} correct`,
    score
  };
}

const TabularMCQGrader = core({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({ grader: gradeTabularMCQ }),
  name: 'TabularMCQGrader',
  description: 'Grades TabularMCQ selections against expected answers',
  category: 'grading',
  component: _Noop,
  fields,
});

export default TabularMCQGrader;
