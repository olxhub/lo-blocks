// blocks-dynamic/Blink/Blink.ts
//
// Demo dynamic block. It lives OUTSIDE the static block tree
// (packages/shared/components/blocks/), so `npm run build:gen-block-registry`
// never sees it. It is loaded at runtime via the `loadBlocks` MCP tool:
//
//   loadBlocks({ source: "blocks-dynamic/Blink" })
//
// Conventions are identical to a static block (that's the point — a matured
// dynamic block is promoted by `git mv`, no format change). The blueprint is
// JSX-free and wires its component through `componentLoader` so it loads
// cleanly on both the server (ssrLoadModule, loader never invoked) and the
// client (Vite rewrites the import).

import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';

const Blink = dev({
  ...parsers.text(),
  name: 'Blink',
  description: 'Renders its text content with an old-school blinking effect.',
  componentLoader: () => import('./_Blink').then((m) => m.default),
});

export default Blink;
