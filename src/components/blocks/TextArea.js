// src/components/blocks/TextArea.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _TextArea from './_TextArea';

export const fields = state.fields(['value']);
const TextArea = core({
  ...parsers.blocks(),
  name: 'TextArea',
  description: 'Multi-line text input field for longer student responses',
  component: _TextArea,
  fields: fields,
  getValue: (props, state, id) => fieldSelector(state, { ...props, id }, fieldByName('value'), { fallback: '', id }),
});

export default TextArea;
