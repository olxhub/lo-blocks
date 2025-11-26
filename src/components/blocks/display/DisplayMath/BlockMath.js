// src/components/blocks/DisplayMath/BlockMath.js
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

import { _BlockMath } from './_BlockMath.jsx';

const BlockMath = dev({
  ...parsers.text(),
  name: 'BlockMath',
  component: _BlockMath,
  description: 'Displays a centered LaTeX math equation as a block element.'
});

export default BlockMath;
