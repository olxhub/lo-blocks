// packages/shared/components/blocks/input/ChoiceInput/KeyGrader.ts
//
// Grader for single-select (radio button) multiple choice questions.
// For multi-select (checkbox) questions, use CheckboxGrader instead.
//
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { getBlockByOLXId } from '@/lib/blocks';
import { getInputs } from '@/lib/blocks/dynamicDom';
import { leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import * as state from '@/lib/state';
import { correctness } from '@/lib/blocks/correctness';

export const fields = state.fields(state.graderFields());

function gradeKeySelected(props, { input, inputApi }) {
  const selected = input ?? '';
  if (!selected) return { correct: correctness.unsubmitted, message: '' };
  const choices = inputApi.getChoices();
  const choice = choices.find(c => c.value === selected);
  if (!choice) return { correct: correctness.invalid, message: '' };
  const correct = choice.tag === 'Key'
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

  // TODO: This grader logic should move to /lib/blocks/. Components shouldn't access
  // blockRegistry and construct props - that's infrastructure logic.
  const inputIds = getInputs(props);
  if (inputIds.length === 0) {
    throw new Error(`KeyGrader "${props.id}": No input found. Nest a ChoiceInput inside, or add target="inputId".`);
  }

  const inputStateKey = inputIds[0];
  const inputDefKey = leafDefinitionKeyFromStateKey(inputStateKey);
  const inputNode = getBlockByOLXId(props, inputDefKey);
  if (!inputNode) {
    throw new Error(`KeyGrader "${props.id}": Input "${inputStateKey}" not found. Check the target attribute.`);
  }

  // TODO: This grader logic should move to /lib/blocks/. Components shouldn't access
  // blockRegistry and construct props - that's infrastructure logic.
  const inputBlueprint = props.runtime.blockRegistry[inputNode.tag];
  const inputProps = { ...props, id: inputDefKey, ...inputNode.attributes, kids: inputNode.kids };
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
  componentLoader: () => import('@/components/blocks/grading/_GraderShell').then(m => m.default),
  fields,
  getDisplayAnswer: getKeyDisplayAnswer,
  inputSchema: z.string(),
});

export default KeyGrader;
