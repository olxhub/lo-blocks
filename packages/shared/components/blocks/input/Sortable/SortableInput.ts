// src/components/blocks/Sortable/SortableInput.js

import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _SortableInput from './_SortableInput';
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
  component: _SortableInput,
  fields,
  selectValue: (props: RuntimeProps, state, _reduxKey) => ({
    arrangement: fieldSelector(state, props, fields.arrangement, { fallback: [] })
  }),
  attributes: z.object({
    dragMode: z.enum(['whole', 'handle']).optional().describe('Drag mode: "whole" (entire item) or "handle" (handle only)'),
    shuffle: z.coerce.boolean().optional().describe('Whether to shuffle items initially (default: true)'),
  }).strict(),
});

export default SortableInput;