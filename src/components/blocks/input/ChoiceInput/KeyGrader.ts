// src/components/blocks/ChoiceInput/KeyGrader.ts
//
// Grader for single-select (radio button) multiple choice questions.
// For multi-select (checkbox) questions, use CheckboxGrader instead.
//
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { getBlockByOLXId } from '@/lib/blocks';
import { getInputs } from '@/lib/blocks/olxdom';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';
import { correctness } from '@/lib/blocks/correctness';

export const fields = state.fields(['correct', 'message']);

function gradeKeySelected(props, { input, inputApi }) {
  const selected = input ?? '';
  const choices = inputApi.getChoices();
  const choice = choices.find(c => c.value === selected);
  // TODO: Handle the situation where nothing is selected (and possible invalid inputs; e.g. if there's a bug)
  const correct = choice?.tag === 'Key'
    ? correctness.correct
    : correctness.incorrect;
  return { correct, message: '' };
}

/**
 * Find the correct answer value by looking for the Key choice.
 * Works with both ChoiceInput (Key/Distractor children) and DropdownInput ((x) marker).
 * Returns a single string value.
 */
function getKeyDisplayAnswer(props) {
  if (props.displayAnswer != null) return props.displayAnswer;
  if (props.answer != null) return props.answer;

  const inputIds = getInputs(props);
  if (inputIds.length === 0) {
    throw new Error(`KeyGrader "${props.id}": No input found. Nest a ChoiceInput inside, or add target="inputId".`);
  }

  const inputId = inputIds[0];
  const inputNode = getBlockByOLXId(props, inputId);
  if (!inputNode) {
    throw new Error(`KeyGrader "${props.id}": Input "${inputId}" not found. Check the target attribute.`);
  }

  const inputBlueprint = props.blockRegistry[inputNode.tag];
  const inputProps = { ...props, id: inputId, ...inputNode.attributes, kids: inputNode.kids };
  const choices = inputBlueprint.locals.getChoices(inputProps);
  const keyChoice = choices.find(c => c.tag === 'Key');
  if (!keyChoice) {
    throw new Error(`KeyGrader "${props.id}": No Key choice found. Add a <Key> element inside the ChoiceInput.`);
  }
  return keyChoice.value;
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
  attributes: baseAttributes.extend({
    target: z.string().optional().describe('ID of the ChoiceInput to grade; infers from children if omitted'),
    answer: z.string().optional().describe('Correct answer value (alternative to using Key/Distractor)'),
    displayAnswer: z.string().optional().describe('Answer text to display when showing answers'),
  }),
});

export default KeyGrader;
