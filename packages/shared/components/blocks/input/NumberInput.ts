// packages/shared/components/blocks/input/NumberInput.ts
import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { placeholder } from '@/lib/blocks/attributeSchemas';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const NumberInput = core({
  ...parsers.ignore(),
  ...input(),
  name: 'NumberInput',
  description: 'Numeric input field that parses and validates numerical values',
  fields,
  // TODO: Figure out this signature. In the generic, we'll probably need
  // more than this. It might be dependent on the component spec, etc.
  selectors: {
    value: (state, props: RuntimeProps, _stateKey) => {
      const v = decodedFieldSelector(state, props, fields.value);
      return v === undefined ? undefined : parseFloat(v as string);
    },
  },
  attributes: z.object({
    ...placeholder,
    min: z.string().optional().describe('Minimum allowed value'),
    max: z.string().optional().describe('Maximum allowed value'),
    step: z.string().optional().describe('Step increment for value changes'),
  }).strict(),
});

export default NumberInput;
