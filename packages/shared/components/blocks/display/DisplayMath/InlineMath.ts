import * as parsers from '@/lib/content/parsers';
import { core } from '@/lib/blocks';

const InlineMath = core({
  ...parsers.text.withTarget(),
  name: 'InlineMath',
  description: 'Renders a short LaTeX math expression inline within text.',
});

export default InlineMath;
