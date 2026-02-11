// src/components/blocks/authoring/OlxSlot/OlxSlot.ts
//
// OlxSlot block - a slot that receives OLX from other blocks (e.g., LLMAction)
// or reactively reads OLX from a target component, and renders it as live
// interactive content.
//
// Like TextSlot, but renders OLX instead of plain text. Drop-in replacement
// wherever you want LLM or student-authored OLX rendered dynamically.
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _OlxSlot from './_OlxSlot';

export const fields = state.fields(['value', 'state']);

const OlxSlot = test({
  ...parsers.ignore(),
  name: 'OlxSlot',
  description: 'A slot that receives OLX and renders it as live interactive content',
  component: _OlxSlot,
  fields,
  attributes: baseAttributes.extend({
    target: z.string().optional()
      .describe('ID of another component to reactively read OLX from (e.g., a TextArea)'),
    debounce: z.coerce.number().default(150)
      .describe('Debounce delay in ms before re-parsing OLX (only used with target)'),
  }),
});

export default OlxSlot;
