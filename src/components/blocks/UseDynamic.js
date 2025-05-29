import React from 'react';
import { dev } from '@/lib/blocks';
import { _UseDynamic } from './_UseDynamic';

import { ignore } from '@/lib/olx/parsers';

const UseDynamic = dev({
  name: 'UseDynamic',
  component: _UseDynamic,
  parser: ignore,
  namespace: 'org.mitros.dev',
  description: 'Include a component block.'
});

export default UseDynamic;
