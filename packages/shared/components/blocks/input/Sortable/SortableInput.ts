// packages/shared/components/blocks/input/Sortable/SortableInput.ts

import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([
  'arrangement',   // Current order of items (array of indices)
  'draggedItem',   // Index of item being dragged
  'dragOverIndex'  // Index of drop target
]);

const SortableInput = core({
  ...parsers.blocks(), // Handle child blocks
  ...input(),
  name: 'SortableInput',
  description: 'Drag-and-drop sortable input for ordering tasks',
  fields,
  selectors: {
    value: (state, props: RuntimeProps, _stateKey) => ({
      arrangement: decodedFieldSelector(state, props, fields.arrangement, { fallback: [] })
    }),
  },
  attributes: z.object({
    dragMode: z.enum(['whole', 'handle']).optional().describe('Drag mode: "whole" (entire item) or "handle" (handle only)'),
    shuffle: z.coerce.boolean().optional().describe('Whether to shuffle items initially (default: true)'),
  }).strict(),
});

export default SortableInput;