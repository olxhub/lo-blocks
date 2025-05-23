import { core } from '@/lib/blocks';
import { text as textParser } from '@/lib/olx/parsers';
import _TextInput from './_TextInput';

const TextInput = core({
  name: 'TextInput',
  component: _TextInput,
  parser: textParser,
  getValue: (state, id) => state?.[id]?.value ?? '',
});

export default TextInput;
