// packages/shared/components/blocks/authoring/OlxSlot/OlxSlot.ts
//
// EXPERIMENTAL / PROTOTYPE
//
// OlxSlot - renders an OLX string as live content. Exploring patterns for
// dynamic OLX authoring (LLM-generated and student-authored). API will
// likely change significantly.
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import { commonFields } from '@/lib/state/commonFields';
import * as parsers from '@/lib/content/parsers';
import { z_olx_boolean, z_stateRef } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([commonFields.value, 'state', 'debounced', 'validOlx', 'error', 'stale']);

const OlxSlot = test({
  ...parsers.blocks.allowHTML(),
  name: 'OlxSlot',
  description: 'Experimental: renders an OLX string as live content',
  fields,
  attributes: z.object({
    target: z_stateRef.optional()
      .describe('ID of another component to read OLX from (resolved via useValue)'),
    debounce: z.coerce.number().default(150)
      .describe('Debounce delay in ms before re-parsing OLX (only used with target)'),
    chrome: z_olx_boolean.optional().default(false)
      .describe('Show a visible border around the slot, making it visible when empty'),
  }).strict(),
});

export default OlxSlot;
