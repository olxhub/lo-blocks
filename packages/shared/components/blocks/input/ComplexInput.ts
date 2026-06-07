// packages/shared/components/blocks/input/ComplexInput.ts

import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _LineInput from './_LineInput';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const validator = (val) => /^[0-9.e+-]*[ij]?$/i.test(val);

const _ComplexInput = (props) =>
  _LineInput({ ...props, updateValidator: validator });

const ComplexInput = core({
  ...parsers.blocks(),
  ...input(),
  name: 'ComplexInput',
  description: 'Text input for complex numbers with validation (supports i/j notation)',
  component: _ComplexInput,
  fields,
  selectValue: (props: RuntimeProps, state, _stateKey) => fieldSelector(state, props, fields.value, { fallback: '' }),
  attributes: z.object({
    placeholder: z.string().optional().describe('Placeholder text shown when empty'),
  }).strict(),
});

export default ComplexInput;
