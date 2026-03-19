// src/components/blocks/NumberInput.js
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes, placeholder } from '@/lib/blocks/attributeSchemas';
import _NumberInput from './_NumberInput';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const NumberInput = core({
  ...parsers.text(),
  name: 'NumberInput',
  isInput: true,
  description: 'Numeric input field that parses and validates numerical values',
  component: _NumberInput,
  fields,
  // TODO: Figure out this signature. In the generic, we'll probably need
  // more than this. It might be dependent on the component spec, etc.
  getValue: (props: RuntimeProps, state, id) => {
    const v = fieldSelector(state, { ...props, id }, fields.value);
    return v === undefined ? undefined : parseFloat(v as string);
  },
  attributes: srcAttributes.extend({
    ...placeholder,
    min: z.string().optional().describe('Minimum allowed value'),
    max: z.string().optional().describe('Maximum allowed value'),
    step: z.string().optional().describe('Step increment for value changes'),
  }),
});

export default NumberInput;
