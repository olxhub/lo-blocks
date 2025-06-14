// src/components/blocks/NumericalGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks';
import * as lo_event from 'lo_event';
import { gradeNumerical } from '@/lib/util/numeric.js';

// TODO: Why is this correctness and not correct?
export const fields = blocks.fields(['correct', 'message']);

// Block implementing a very simple numerical grader used for testing.
const NumericalGrader = blocks.test({
  ...parsers.blocks,
  ...blocks.grader({
    grader: gradeNumerical,
  }),
  name: 'NumericalGrader',
  component: blocks.NoopBlock,
  fields,
});

export default NumericalGrader;
