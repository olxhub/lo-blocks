// TODO: Rename to ChoiceGrader?

// src/components/blocks/ChoiceInput/KeyGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { getInputs } from '@/lib/blocks/olxdom';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';
import { CORRECTNESS } from '@/lib/blocks/correctness.js';

export const fields = state.fields(['correct', 'message']);

function gradeKeySelected(props, { input, inputApi }) {
  const selected = input ?? '';
  const choices = inputApi.getChoices();
  const choice = choices.find(c => c.value === selected);
  // TODO: Handle the situation where nothing is selected (and possible invalid inputs; e.g. if there's a bug)
  const correct = choice?.tag === 'Key'
    ? CORRECTNESS.CORRECT
    : CORRECTNESS.INCORRECT;
  return { correct, message: '' };
}

/**
 * Find the correct answer value by looking for the Key choice.
 * Works with both ChoiceInput (Key/Distractor children) and DropdownInput ((x) marker).
 */
function getKeyDisplayAnswer(props) {
  // If explicit answer/displayAnswer provided, use that
  if (props.displayAnswer != null) return props.displayAnswer;
  if (props.answer != null) return props.answer;

  // Otherwise, find the Key choice from the input
  try {
    const inputIds = getInputs(props);
    if (inputIds.length === 0) return null;

    const inputId = inputIds[0];
    const inputNode = props.idMap?.[inputId];
    const inputBlueprint = inputNode ? props.componentMap?.[inputNode.tag] : null;

    // Use getChoices() if available (ChoiceInput, DropdownInput)
    if (inputBlueprint?.locals?.getChoices) {
      const inputProps = { ...props, id: inputId, ...inputNode?.attributes, kids: inputNode?.kids };
      const choices = inputBlueprint.locals.getChoices(inputProps);
      const keyChoice = choices.find(c => c.tag === 'Key');
      return keyChoice?.value ?? null;
    }
  } catch (e) {
    // No inputs found or error - return null
  }
  return null;
}

const KeyGrader = blocks.test({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({ grader: gradeKeySelected }),
  name: 'KeyGrader',
  description: 'Grades multiple choice selections by checking if Key was chosen over Distractor',
  category: 'grading',
  component: _Noop,
  fields,
  getDisplayAnswer: getKeyDisplayAnswer,
});

export default KeyGrader;
