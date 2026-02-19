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
// source-file readability. Renders as Markdown: *** + ### heading.

import { test } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { _Markdown } from './Markdown/_Markdown';

function stripDecoration(text: string): string {
  const stripped = text.replace(/^[\s=]+|[\s=]+$/g, '');
  if (!stripped) return '***\n';
  return `***\n\n# ${stripped}\n`;
}

const HH = test({
  ...parsers.text({ postprocess: stripDecoration }),
  name: 'HH',
  description: 'Visual section divider — horizontal rule with optional heading',
  component: _Markdown,
  internal: true,
  requiresUniqueId: false,
  attributes: baseAttributes,
});

export default HH;
