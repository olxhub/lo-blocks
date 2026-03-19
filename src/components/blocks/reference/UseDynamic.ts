// src/components/blocks/UseDynamic.js
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { _UseDynamic } from './_UseDynamic';
import { ignore } from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields(
  ['value']
);

const UseDynamic = dev({
  ...ignore(),
  name: 'UseDynamic',
  component: _UseDynamic,
  description: 'Include a component block.',
  fields: fields,
  attributes: baseAttributes.extend({
    target: z.string().optional().describe('Component ID to render dynamically'),
    targetRef: z.string().optional().describe('ID of component whose value determines the target'),
  }),
});

export default UseDynamic;
