// src/components/blocks/DisplayMath/BlockMath.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';

import { _BlockMath } from './_BlockMath';

const BlockMath = core({
  ...parsers.text(),
  name: 'BlockMath',
  component: _BlockMath,
  description: 'Displays a centered LaTeX math equation as a block element.',
  attributes: srcAttributes.strict(),
});

export default BlockMath;
