// src/components/blocks/ComplexInput.js

import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _LineInput from './_LineInput';

export const fields = state.fields(['value']);

const validator = (val) => /^[0-9.e+-]*[ij]?$/i.test(val);

const _ComplexInput = (props) =>
  _LineInput({ ...props, updateValidator: validator });

const ComplexInput = core({
  ...parsers.blocks(),
  name: 'ComplexInput',
  description: 'Text input for complex numbers with validation (supports i/j notation)',
  component: _ComplexInput,
  fields,
  getValue: (props, state, id) => state?.application_state?.component?.[id]?.value ?? '',
});

export default ComplexInput;
