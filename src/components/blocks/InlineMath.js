import { _InlineMath } from './_InlineMath';

import * as parsers from '@/lib/olx/parsers';
import { dev } from '@/lib/blocks';

const InlineMath = dev({
  name: 'InlineMath',
  component: _InlineMath,
  parser: parsers.text,
  description: 'Renders a short LaTeX math expression inline within text.'
});

export default InlineMath;
