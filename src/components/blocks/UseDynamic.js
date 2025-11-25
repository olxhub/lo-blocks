// src/components/blocks/UseDynamic.js
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';

import { _UseDynamic } from './_UseDynamic';

import { ignore } from '@/lib/content/parsers';

export const fields = state.fields(
  ['value']
);

const UseDynamic = dev({
  ...ignore(),
  name: 'UseDynamic',
  component: _UseDynamic,
  namespace: 'org.mitros.dev',
  description: 'Include a component block.',
  fields: fields
});

export default UseDynamic;
