// src/components/blocks/Vertical/Vertical.jsx
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import { _Vertical } from './_Vertical';

const Vertical = dev({
  ...parsers.blocks(),
  name: 'Vertical',
  description: 'Container component that arranges child blocks vertically (following edX OLX conventions)',
  component: _Vertical,
});

export default Vertical;