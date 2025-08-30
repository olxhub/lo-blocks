// src/components/blocks/Sortable/SortableInput.js

import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _SortableInput from './_SortableInput';

export const fields = state.fields([
  'arrangement',  // Current order of items (array of indices)
  'submitted'     // Whether student has submitted
]);

const SortableInput = core({
  ...parsers.blocks(), // Handle child blocks
  name: 'SortableInput',
  description: 'Drag-and-drop sortable input for ordering tasks',
  component: _SortableInput,
  fields,
  getValue: (state, id) => ({
    arrangement: state?.[id]?.arrangement || [],
    submitted: state?.[id]?.submitted || false
  })
});

export default SortableInput;