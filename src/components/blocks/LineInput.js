import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/olx/parsers';
import _LineInput from './_LineInput';

export const fields = blocks.fields(['value']);

const LineInput = blocks.core({
  ...parsers.blocks,
  name: 'LineInput',
  component: _LineInput,
  fields,
  getValue: (state, id) => state?.[id]?.value ?? '',
});

export default LineInput;
