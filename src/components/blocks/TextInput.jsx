import * as blocks from '@/lib/blocks';
import { text as textParser } from '@/lib/olx/parsers';
import _TextInput from './_TextInput';

export const fields = blocks.fields(
  ['value']
);


const TextInput = blocks.core({
  ...textParser,
  name: 'TextInput',
  component: _TextInput,
  fields: fields,
  getValue: (state, id) => state?.[id]?.value ?? '',
});

export default TextInput;
