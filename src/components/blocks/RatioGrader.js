// src/components/blocks/RatioGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import _Noop from './_Noop';
import * as state from '@/lib/state';
import { gradeRatio } from '@/lib/util/numeric.js';

export const fields = state.fields(['correct', 'message']);

const RatioGrader = blocks.test({
  ...parsers.blocks(),
  ...blocks.grader({
    grader: gradeRatio,
  }),
  name: 'RatioGrader',
  description: 'Grades ratio and fraction answers, comparing the ratio between two inputs',
  component: _Noop,
  fields,
});

export default RatioGrader;

