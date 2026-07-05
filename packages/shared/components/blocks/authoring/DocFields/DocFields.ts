// packages/shared/components/blocks/authoring/DocFields/DocFields.ts
//
// DocFields — one block's field (runtime state) documentation, embeddable
// anywhere: <DocFields block="CapaProblem"/>. Sibling of DocAttributes;
// same FieldsSection the docs page's Quick Reference composes.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const DocFields = dev({
  ...parsers.ignore(),
  name: 'DocFields',
  description: 'Field (runtime state) documentation for one block, embeddable in courseware',
  requiresUniqueId: false,
  attributes: z.object({
    block: z.string({ required_error: 'block is required' }).describe(
      'Name of the block to document (e.g. "CapaProblem")'),
  }).strict(),
});

export default DocFields;
