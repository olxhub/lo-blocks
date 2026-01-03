// src/components/blocks/ComplexInput.js

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _LineInput from './_LineInput';
import type { RuntimeProps } from '@/lib/types';

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
  getValue: (props: RuntimeProps, state, id) => fieldSelector(state, { ...props, id }, fieldByName('value'), { fallback: '' }),
  attributes: baseAttributes.extend({
    placeholder: z.string().optional().describe('Placeholder text shown when empty'),
  }),
});

export default ComplexInput;
