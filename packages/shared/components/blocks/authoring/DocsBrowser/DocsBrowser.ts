// packages/shared/components/blocks/authoring/DocsBrowser/DocsBrowser.ts
//
// DocsBrowser — full block-documentation browser: searchable/collapsible
// category sidebar (BlockIndex's listing, restructured as navigation) plus
// a detail pane showing one block's full documentation (BlockDoc's content,
// reused via BlockDocContent). This is the block behind the /docs pages;
// apps/client's DocsPage renders it directly instead of composing
// BlockIndex + BlockDoc itself.
//
// Usage:
//   <DocsBrowser/>                    no block selected — welcome pane
//   <DocsBrowser selected="Chat"/>    Chat's documentation shown in the main pane

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import { z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import * as parsers from '@/lib/content/parsers';
import { blockDocFields } from '../BlockDoc/locals';
import { docsBrowserFields } from './locals';

const DocsBrowser = dev({
  ...parsers.ignore(),
  name: 'DocsBrowser',
  description: 'Searchable block-documentation browser — category sidebar plus a detail pane',
  // Pure listing/navigation, no per-instance state beyond UI fields: duplicates are fine.
  requiresUniqueId: false,
  attributes: z.object({
    selected: z.string().optional().describe('Block name whose documentation shows in the main pane'),
    internal: z_olx_boolean.optional().describe(
      'Show internal/system blocks by default — the authored default for ' +
      'the sidebar\'s "internal blocks" toggle (a field overrides it per user)'),
  }).strict(),
  // Extends BlockDoc's docTab field (not just docsBrowserFields) — the
  // detail pane reuses BlockDocContent, which needs a docTab field on
  // whichever block instance hosts it.
  fields: docsBrowserFields.extend(blockDocFields),
});

export default DocsBrowser;
