// packages/shared/components/blocks/authoring/BlockDoc/BlockDoc.ts
//
// BlockDoc — full documentation for one block: description, category chips,
// attributes table, README, and examples. This is the detail-page component
// of the documentation system, meant to be embeddable directly in
// courseware (authoring courses teaching block usage), not just a
// standalone docs site.
//
// Usage:
//   <BlockDoc block="Chat"/>

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { blockDocFields } from './locals';

const BlockDoc = dev({
  ...parsers.ignore(),
  name: 'BlockDoc',
  description: 'Renders one block\'s full documentation — description, attributes, README, examples',
  // Pure listing, no per-instance state: duplicates are fine (like BlockIndex).
  requiresUniqueId: false,
  attributes: z.object({
    block: z.string().describe('Name of the block to document (e.g. "Chat")'),
  }).strict(),
  fields: blockDocFields,
});

export default BlockDoc;
