import * as parsers from '@/lib/olx/parsers';
import * as blocks from '@/lib/blocks';

const Response = blocks.test({
  ...parsers.ignore,
  ...blocks.response({
    grader: (props, input) => input === parseFloat(props.answer) ? 'correct' : 'incorrect'
  }),
  name: 'Response',
  component: blocks.NoopBlock
});

export default Response;
