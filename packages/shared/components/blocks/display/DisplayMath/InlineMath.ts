// src/components/blocks/DisplayMath/InlineMath.js
import { _InlineMath } from './_InlineMath';

import * as parsers from '@/lib/content/parsers';
import { core } from '@/lib/blocks';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';

const InlineMath = core({
  ...parsers.text(),
  name: 'InlineMath',
  component: _InlineMath,
  description: 'Renders a short LaTeX math expression inline within text.',
  attributes: srcAttributes.strict(),
});

export default InlineMath;
