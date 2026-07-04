// packages/shared/components/blocks/action/HelloAction.ts
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';

const HelloAction = blocks.test({
  ...parsers.ignore(),
  ...blocks.action({
    action: () => alert("Hello, World!")
  }),
  name: 'HelloAction',
  description: 'Testing block that shows "Hello, World!" alert when triggered',
  // Shared no-op renderer lives in layout/, not a sibling of this file.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
});

export default HelloAction;
