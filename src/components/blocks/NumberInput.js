// src/components/blocks/NumberInput.js
import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/olx/parsers';
import _NumberInput from './_NumberInput';

export const fields = blocks.fields(['value']);

const NumberInput = blocks.core({
  ...parsers.text,
  name: 'NumberInput',
  component: _NumberInput,
  fields,
  // TODO: Figure out this signature. In the generic, we'll probably need
  // more than this. It might be dependent on the component spec, etc.
  getValue: (state, id) => {
    const v = state?.[id]?.value;
    return v === undefined ? undefined : parseFloat(v);
  }
});

export default NumberInput;
