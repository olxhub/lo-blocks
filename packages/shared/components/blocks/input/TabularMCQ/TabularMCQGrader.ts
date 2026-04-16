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
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';

export const fields = state.fields(state.graderFields());

/**
 * Get display answer for TabularMCQ - returns { rowId: number[] } map of correct column indices.
 * Used by _TabularMCQ.jsx when showAnswer is true.
 */
function getTabularMCQDisplayAnswer(props) {
  if (props.displayAnswer != null) return props.displayAnswer;
  if (props.answer != null) return props.answer;

  // TODO: This grader logic should move to /lib/blocks/. Components shouldn't access
  // blockRegistry and construct props - that's infrastructure logic.
  try {
    const inputIds = getInputs(props);
    const inputNode = getBlockByOLXId(props, inputIds[0]);
    const inputBlueprint = inputNode ? props.runtime.blockRegistry?.[inputNode.tag] : null;

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
  const mode = inputApi.getMode();
  let correct = 0;
  gradedRows.forEach(row => {
    const expected = answers[row.id]; // number[]
    const selected = input[row.id];   // number (radio) or number[] (checkbox)
    if (mode === 'checkbox') {
      const sel = Array.isArray(selected) ? [...selected].sort() : [];
      const exp = [...expected].sort();
      if (sel.length === exp.length && sel.every((v, i) => v === exp[i])) {
        correct++;
      }
    } else {
      if (expected.includes(selected)) {
        correct++;
      }
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
