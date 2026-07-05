// packages/shared/components/blocks/authoring/DocAttributes/DocAttributes.ts
//
// DocAttributes — one block's attribute documentation, embeddable anywhere:
//
//   <Markdown>CapaProblem takes these attributes:</Markdown>
//   <DocAttributes block="CapaProblem"/>
//
// Renders the same AttributesSection the docs page's Quick Reference uses
// (block-specific attributes as a table; shared base/input/grader mixins as
// compact mouseover lines), so courseware and /docs never drift. Sibling of
// DocFields; BlockDoc composes both.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const DocAttributes = dev({
  ...parsers.ignore(),
  name: 'DocAttributes',
  description: 'Attribute documentation for one block, embeddable in courseware',
  // Pure display, no per-instance state (like BlockIndex).
  requiresUniqueId: false,
  attributes: z.object({
    block: z.string({ required_error: 'block is required' }).describe(
      'Name of the block to document (e.g. "CapaProblem")'),
  }).strict(),
});

export default DocAttributes;
