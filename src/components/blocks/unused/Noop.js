// src/components/blocks/Noop.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Noop from './_Noop';

const Noop = core({
  ...parsers.blocks,
  name: 'Noop',
  component: _Noop,
});

export default Noop;
