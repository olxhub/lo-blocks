import * as parsers from '@/lib/olx/parsers';
import * as blocks from '@/lib/blocks';
import { _DevQuestion } from './_DevQuestion';

export const fields = blocks.fields(
  ['activeIndex']
);

const DevQuestion = blocks.test({
  ...parsers.ignore,
  name: 'DevQuestion',
  component: _DevQuestion,
  fields: fields
});

export default DevQuestion;
