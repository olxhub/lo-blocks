// packages/shared/components/blocks/display/Notice/Notice.ts
//
// Notice — the platform licensing/attribution notice, or a custom content
// notice (e.g. course licensing), as a block. Wraps the Notice React
// component (components/common/Notice.tsx) that pages like StaticPage use
// directly, so OLX content — docs pages, courses — can carry the same
// notice.
//
// Usage:
//   <Notice/>                                  platform notice
//   <Notice content="© 2026 Course Author"/>   custom markdown notice

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Notice = dev({
  ...parsers.ignore(),
  name: 'Notice',
  description: 'Platform licensing/attribution notice, or a custom content notice (markdown)',
  // Pure display, no per-instance state: duplicates are fine (like BlockIndex).
  requiresUniqueId: false,
  attributes: z.object({
    content: z.string().optional().describe(
      'Custom notice text (markdown); omit for the platform notice'),
  }).strict(),
});

export default Notice;
