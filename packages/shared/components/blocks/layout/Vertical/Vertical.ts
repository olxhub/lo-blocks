// packages/shared/components/blocks/layout/Vertical/Vertical.ts
import * as parsers from '@/lib/content/parsers';
import { core } from '@/lib/blocks';

const Vertical = core({
  ...parsers.blocks(),
  name: 'Vertical',
  description: 'Container component that arranges child blocks vertically (following edX OLX conventions)',
});

export default Vertical;