// src/components/blocks/Vertical/Vertical.jsx
import * as parsers from '@/lib/content/parsers';
import { core } from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { _Vertical } from './_Vertical';

const Vertical = core({
  ...parsers.blocks(),
  name: 'Vertical',
  description: 'Container component that arranges child blocks vertically (following edX OLX conventions)',
  component: _Vertical,
  attributes: baseAttributes.strict(),
});

export default Vertical;