// packages/shared/components/blocks/authoring/BlockIndex/BlockIndex.ts
//
// BlockIndex — a listing of available blocks with descriptions, for
// documentation pages and authoring courses.
//
// Usage:
//   <BlockIndex/>                              all (non-internal) blocks
//   <BlockIndex categories="input,grading"/>   just those categories
//   <BlockIndex blocks="Markdown,Chat"/>       an explicit set
//
// Data comes from the get_blocks MCP tool (descriptor-level only — no
// block code loads for a listing). Progressive reveal in an authoring
// course is ordinary adaptive content: put `when=` on BlockIndex
// instances, or on the containers around them.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const BlockIndex = dev({
  ...parsers.ignore(),
  name: 'BlockIndex',
  description: 'Lists available blocks with descriptions — filterable by category or explicit block names',
  // Pure listing, no per-instance state: duplicates are fine (like Markdown).
  requiresUniqueId: false,
  attributes: z.object({
    categories: z.string().optional().describe(
      'Comma-separated block categories to list (e.g. "input,grading")'),
    blocks: z.string().optional().describe(
      'Comma-separated block names to list (e.g. "Markdown,Chat"); combines (OR) with categories='),
  }).strict(),
});

export default BlockIndex;
