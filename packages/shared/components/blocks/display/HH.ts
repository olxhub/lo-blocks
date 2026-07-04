// HH - Visual section divider with optional heading
//
// A horizontal rule (***) with an optional heading, designed to be
// visually prominent in OLX source files:
//
//   <HH> ============= Screen: Introduction ============= </HH>
//   <HH>Chapter 3</HH>
//   <HH/>
//
// The === decoration is stripped at parse time; it's purely for
// source-file readability. Renders as Markdown: *** + # heading.

import { test } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

function stripDecoration(text: string): string {
  const stripped = text.replace(/^[\s=]+|[\s=]+$/g, '');
  if (!stripped) return '***\n';
  return `***\n\n# ${stripped}\n`;
}

const HH = test({
  ...parsers.text({ postprocess: stripDecoration }),
  name: 'HH',
  description: 'Visual section divider — horizontal rule with optional heading',
  // Non-conventional: HH reuses Markdown's renderer rather than its own sibling file.
  componentLoader: () => import('./Markdown/_Markdown').then(m => m._Markdown),
  internal: true,
  requiresUniqueId: false,
});

export default HH;
