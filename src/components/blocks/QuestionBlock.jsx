import * as parsers from '@/lib/olx/parsers';
import * as blocks from '@/lib/blocks';
import { _QuestionBlock } from './_QuestionBlock';

export const fields = blocks.fields(
  ['activeIndex']
);

const QuestionBlock = blocks.test({
  name: 'QuestionBlock',
  component: _QuestionBlock,
  parser: parsers.ignore,
  fieldToEventMap: fields
});

export default QuestionBlock;
