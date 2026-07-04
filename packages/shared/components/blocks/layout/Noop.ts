// packages/shared/components/blocks/layout/Noop.ts
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Noop = core({
  ...parsers.blocks(),
  name: 'Noop',
  description: 'Invisible container that renders child components without additional styling',
  internal: true,
});

export default Noop;
