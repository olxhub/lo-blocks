// packages/shared/components/blocks/input/ComplexInput.ts

import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const ComplexInput = core({
  ...parsers.blocks(),
  ...input(),
  name: 'ComplexInput',
  description: 'Text input for complex numbers with validation (supports i/j notation)',
  fields,
  selectValue: (props: RuntimeProps, state, _stateKey) => fieldSelector(state, props, fields.value, { fallback: '' }),
  attributes: z.object({
    placeholder: z.string().optional().describe('Placeholder text shown when empty'),
  }).strict(),
});

export default ComplexInput;
