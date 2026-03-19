// src/components/blocks/Hidden.js
import * as parsers from '@/lib/content/parsers';
import { core } from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Hidden from './_Hidden';

const Hidden = core({
  ...parsers.blocks(),
  name: 'Hidden',
  description: 'A block that renders its children in the OLX DOM but does not display them',
  component: _Hidden,
  attributes: baseAttributes.strict(),
});

export default Hidden;
