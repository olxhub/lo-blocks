import * as parsers from '@/lib/olx/parsers';
import * as blocks from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks';
import { gradeNumerical } from '@/lib/math/numeric.js';

// TODO: Why is this correctness and not correct?
export const fields = blocks.fields(['correct']);

// Block implementing a very simple numerical grader used for testing.
const NumericalGrader = blocks.test({
  ...parsers.xblocks,
  ...blocks.grader({
    grader: (props, input) =>
      gradeNumerical(props, input)
        ? CORRECTNESS.CORRECT
        : CORRECTNESS.INCORRECT
  }),
  name: 'NumericalGrader',
  component: blocks.NoopBlock,
  fields,
});

export default NumericalGrader;
