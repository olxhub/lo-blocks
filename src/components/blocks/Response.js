import * as parsers from '@/lib/olx/parsers';
import * as blocks from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks';

// TODO: Why is this correctness and not correct?
export const fields = blocks.fields(['correct']);

// TODO: Rename. Probably SampleNumericalResponse or something.
const Response = blocks.test({
  ...parsers.xblocks,
  ...blocks.response({
    grader: (props, input) => input === parseFloat(props.answer)
      ? CORRECTNESS.CORRECT
      : CORRECTNESS.INCORRECT
  }),
  name: 'Response',
  component: blocks.NoopBlock,
  fields,
});

export default Response;
