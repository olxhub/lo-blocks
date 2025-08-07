// src/components/blocks/NumericalGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import _Noop from './_Noop';
import * as state from '@/lib/state';
import { CORRECTNESS } from '@/lib/blocks';
import * as lo_event from 'lo_event';
import { gradeNumerical } from '@/lib/util/numeric.js';

// TODO: Why is this correctness and not correct?
export const fields = state.fields(['correct', 'message']);

const NumericalGrader = blocks.test({
  ...parsers.blocks(),
  ...blocks.grader({
    grader: gradeNumerical,
  }),
  name: 'NumericalGrader',
  description: 'Grades numeric answers with tolerance for rounding and formatting variations',
  component: _Noop,
  fields,
});

export default NumericalGrader;
