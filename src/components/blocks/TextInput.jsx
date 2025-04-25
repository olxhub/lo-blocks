import { core } from '../blocks.js';
import { text as textParser } from '@/lib/olx/parsers';
import _TextInput from './TextInputClient';

const TextInput = core({
  name: 'TextInput',
  component: _TextInput,
  parser: textParser,
  getValue: (state, id) => state?.[id]?.value ?? '',
});

export default TextInput;
