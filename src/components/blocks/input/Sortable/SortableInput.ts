// src/components/blocks/Sortable/SortableInput.js

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _SortableInput from './_SortableInput';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([
  'arrangement'   // Current order of items (array of indices)
]);

const SortableInput = core({
  ...parsers.blocks(), // Handle child blocks
  name: 'SortableInput',
  description: 'Drag-and-drop sortable input for ordering tasks',
  component: _SortableInput,
  fields,
  getValue: (props: RuntimeProps, state, id) => ({
    arrangement: fieldSelector(state, { ...props, id }, fieldByName('arrangement'), { fallback: [] })
  }),
  attributes: baseAttributes.extend({
    dragMode: z.enum(['whole', 'handle']).optional().describe('Drag mode: "whole" (entire item) or "handle" (handle only)'),
    shuffle: z.coerce.boolean().optional().describe('Whether to shuffle items initially (default: true)'),
  }),
});

export default SortableInput;