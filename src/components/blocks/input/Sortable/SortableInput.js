// src/components/blocks/Sortable/SortableInput.js

import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _SortableInput from './_SortableInput';

export const fields = state.fields([
  'arrangement'   // Current order of items (array of indices)
]);

const SortableInput = core({
  ...parsers.blocks(), // Handle child blocks
  name: 'SortableInput',
  description: 'Drag-and-drop sortable input for ordering tasks',
  component: _SortableInput,
  fields,
  getValue: (props, state, id) => ({
    arrangement: fieldSelector(state, { ...props, id }, fieldByName('arrangement'), { fallback: [] })
  })
});

export default SortableInput;