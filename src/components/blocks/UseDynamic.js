import React from 'react';
import * as blocks from '@/lib/blocks';

import { _UseDynamic } from './_UseDynamic';

import { ignore } from '@/lib/olx/parsers';

export const fields = blocks.fields(
  ['value']
);

const UseDynamic = blocks.dev({
  name: 'UseDynamic',
  component: _UseDynamic,
  parser: ignore,
  namespace: 'org.mitros.dev',
  description: 'Include a component block.',
  fieldToEventMap: fields
});

export default UseDynamic;
