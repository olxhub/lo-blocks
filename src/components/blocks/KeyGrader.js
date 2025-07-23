// src/components/blocks/KeyGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import _Noop from './_Noop';
import * as state from '@/lib/state';
import gradeKeySelected from './gradeKeySelected.js';

export const fields = state.fields(['correct', 'message']);


const KeyGrader = blocks.test({
  ...parsers.blocks,
  ...blocks.grader({ grader: gradeKeySelected }),
  name: 'KeyGrader',
  component: _Noop,
  fields,
});

export default KeyGrader;
