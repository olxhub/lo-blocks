import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/olx/parsers';

import { _BlockMath } from './_BlockMath.jsx';

const BlockMath = dev({
  name: 'BlockMath',
  component: _BlockMath,
  parser: parsers.text,
  description: 'Displays a centered LaTeX math equation as a block element.'
});

export default BlockMath;
