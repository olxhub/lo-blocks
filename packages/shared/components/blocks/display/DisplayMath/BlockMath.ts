import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const BlockMath = core({
  ...parsers.textWithTemplate(parsers.text.withTarget()),
  name: 'BlockMath',
  description: 'Displays a centered LaTeX math equation as a block element.',
});

export default BlockMath;
