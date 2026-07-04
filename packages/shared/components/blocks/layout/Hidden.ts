// packages/shared/components/blocks/layout/Hidden.ts
import * as parsers from '@/lib/content/parsers';
import { core } from '@/lib/blocks';

const Hidden = core({
  ...parsers.blocks(),
  name: 'Hidden',
  description: 'A block that renders its children in the OLX DOM but does not display them',
});

export default Hidden;
