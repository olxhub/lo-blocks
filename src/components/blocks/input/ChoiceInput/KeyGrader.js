// TODO: Rename to ChoiceGrader?

// src/components/blocks/ChoiceInput/KeyGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
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

const KeyGrader = blocks.test({
  ...parsers.blocks(),
  ...blocks.grader({ grader: gradeKeySelected }),
  name: 'KeyGrader',
  description: 'Grades multiple choice selections by checking if Key was chosen over Distractor',
  category: 'grading',
  component: _Noop,
  fields,
});

export default KeyGrader;
