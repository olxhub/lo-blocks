// src/components/blocks/UseDynamic.js
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { _UseDynamic } from './_UseDynamic';
import { ignore } from '@/lib/content/parsers';
import { baseAttributes, z_target, z_reduxStateKey } from '@/lib/blocks/attributeSchemas';

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
    target: z_target.optional().describe('Component ID to render dynamically'),
    targetRef: z_reduxStateKey.optional().describe('ID of component whose value determines the target'),
  }),
});

export default UseDynamic;
