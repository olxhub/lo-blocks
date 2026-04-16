import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

import { _BlockMath } from './_BlockMath';

const BlockMath = core({
  ...parsers.text.withTarget(),
  name: 'BlockMath',
  component: _BlockMath,
  description: 'Displays a centered LaTeX math equation as a block element.',
});

export default BlockMath;
