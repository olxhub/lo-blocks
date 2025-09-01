// src/components/blocks/LineInput.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _LineInput from './_LineInput';

export const fields = state.fields(['value']);

const LineInput = core({
  ...parsers.blocks(),
  name: 'LineInput',
  description: 'Single-line text input field for student responses',
  component: _LineInput,
  fields,
  getValue: (props, state, id) => state?.application_state?.component?.[id]?.value ?? '',
});

export default LineInput;
