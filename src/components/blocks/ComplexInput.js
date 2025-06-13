// src/components/blocks/ComplexInput.js

import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/olx/parsers';
import _LineInput from './_LineInput';

export const fields = blocks.fields(['value']);

const validator = (val) => /^[0-9.e+-]*[ij]?$/i.test(val);

const _ComplexInput = (props) =>
  _LineInput({ ...props, updateValidator: validator });

const ComplexInput = blocks.core({
  ...parsers.blocks,
  name: 'ComplexInput',
  component: _ComplexInput,
  fields,
  getValue: (state, id) => state?.[id]?.value ?? '',
});

export default ComplexInput;
