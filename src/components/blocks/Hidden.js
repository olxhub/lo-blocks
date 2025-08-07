// src/components/blocks/Hidden.js
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import _Hidden from './_Hidden';

const Hidden = dev({
  ...parsers.blocks(),
  name: 'Hidden',
  description: 'A block that renders its children in the OLX DOM but does not display them',
  component: _Hidden,
});

export default Hidden;
