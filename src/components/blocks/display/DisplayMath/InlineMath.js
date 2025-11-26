// src/components/blocks/DisplayMath/InlineMath.js
import { _InlineMath } from './_InlineMath';

import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';

const InlineMath = dev({
  ...parsers.text(),
  name: 'InlineMath',
  component: _InlineMath,
  description: 'Renders a short LaTeX math expression inline within text.'
});

export default InlineMath;
