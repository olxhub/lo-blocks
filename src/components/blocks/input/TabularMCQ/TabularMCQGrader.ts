// src/components/blocks/TabularMCQ/TabularMCQGrader.ts
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
import { core, correctness, getInputs, getBlockByOLXId } from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';

export const fields = state.fields(['correct', 'message', 'score']);

/**
 * Get display answer for TabularMCQ - returns { rowId: colIndex } map of correct answers.
 * Used by _TabularMCQ.jsx when showAnswer is true.
 */
function getTabularMCQDisplayAnswer(props) {
  if (props.displayAnswer != null) return props.displayAnswer;
  if (props.answer != null) return props.answer;

  try {
    const inputIds = getInputs(props);
    const inputNode = getBlockByOLXId(props, inputIds[0]);
    const inputBlueprint = inputNode ? props.blockRegistry?.[inputNode.tag] : null;

    if (inputBlueprint?.locals?.getAnswers) {
      const inputProps = {
        ...props,
        id: inputIds[0],
        ...inputNode?.attributes,
        kids: inputNode?.kids
      };
      return inputBlueprint.locals.getAnswers(inputProps);
    }
  } catch (e) { /* Return null if we can't find answers */ }
  return null;
}

function gradeTabularMCQ(props, { input, inputApi }) {
  const answers = inputApi.getAnswers();
  const rows = inputApi.getRows();

  // Count how many rows have expected answers
  const gradedRows = rows.filter(row => row.answer !== null);
  const total = gradedRows.length;

  if (total === 0) {
    // HACK: Survey mode - no correct answers defined.
    // TODO: Need a Doneness system separate from Correctness.
    // Doneness tracks completion (for progress, prerequisites, deadlines).
    // Correctness tracks grading. Surveys are "done" but not "graded".
    // For now, return CORRECT to indicate completion.
    return {
      correct: correctness.correct,
      message: 'Survey completed.',
      score: 1
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
    correct: allCorrect ? correctness.correct : correctness.incorrect,
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
  getDisplayAnswer: getTabularMCQDisplayAnswer,
  // Uses grader mixin attributes (target, answer, displayAnswer)
});

export default TabularMCQGrader;
