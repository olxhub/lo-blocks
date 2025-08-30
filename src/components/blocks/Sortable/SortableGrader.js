// src/components/blocks/Sortable/SortableGrader.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import _Noop from '../_Noop';
import * as state from '@/lib/state';
import { gradeArrangement } from './gradingUtils';

export const fields = state.fields(['correct', 'message']);

const SortableGrader = blocks.test({
  ...parsers.blocks(),
  ...blocks.grader({
    grader: gradeArrangement,
  }),
  name: 'SortableGrader',
  description: 'Grades sortable arrangements with various algorithms (exact, partial, adjacent, spearman)',
  component: _Noop,
  fields,
});

export default SortableGrader;