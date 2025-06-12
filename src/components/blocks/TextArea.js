import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/olx/parsers';
import _TextArea from './_TextArea';

export const fields = blocks.fields(['value']);


const TextArea = blocks.core({
  ...parsers.blocks,
  name: 'TextArea',
  component: _TextArea,
  fields: fields,
  getValue: (state, id) => state?.[id]?.value ?? '',
});

export default TextArea;
