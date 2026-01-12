// src/components/blocks/TextArea.js
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes, placeholder } from '@/lib/blocks/attributeSchemas';
import _TextArea from './_TextArea';

export const fields = state.fields([commonFields.value]);
const TextArea = core({
  ...parsers.blocks(),
  name: 'TextArea',
  isInput: true,
  description: 'Multi-line text input field for longer student responses',
  component: _TextArea,
  fields: fields,
  // as any: See getValue spec in lib/blocks/actions.tsx
  getValue: ((props, state, id) => fieldSelector(state, props, fields.value, { fallback: '', id })) as any,
  attributes: baseAttributes.extend({
    ...placeholder,
    rows: z.string().optional().describe('Number of visible text rows'),
    readonly: z.enum(['true', 'false']).optional().describe('Make textarea read-only'),
  }),
});

export default TextArea;
