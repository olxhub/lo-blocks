import React from 'react';
import * as blocks from '@/lib/blocks';

import { _UseDynamic } from './_UseDynamic';

import { ignore } from '@/lib/olx/parsers';

export const fields = blocks.fields(
  ['value']
);

const UseDynamic = blocks.dev({
  ...ignore,
  name: 'UseDynamic',
  component: _UseDynamic,
  namespace: 'org.mitros.dev',
  description: 'Include a component block.',
  fields: fields
});

export default UseDynamic;
