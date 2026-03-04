// src/components/blocks/Noop.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from './_Noop';

const Noop = core({
  ...parsers.blocks(),
  name: 'Noop',
  description: 'Invisible container that renders child components without additional styling',
  component: _Noop,
  internal: true,
  attributes: baseAttributes.strict(),
});

export default Noop;
