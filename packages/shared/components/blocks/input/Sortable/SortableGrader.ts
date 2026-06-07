// packages/shared/components/blocks/input/Sortable/SortableGrader.ts
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';
import { gradeArrangement } from './gradingUtils';

export const fields = state.fields(state.graderFields());

const SortableGrader = blocks.test({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({
    grader: gradeArrangement,
    inputType: 'single',
  }),
  name: 'SortableGrader',
  description: 'Grades sortable arrangements with various algorithms (exact, partial, adjacent, spearman, survey)',
  category: 'grading',
  component: _Noop,
  fields,
  attributes: z.object({
    algorithm: z.enum(['exact', 'partial', 'adjacent', 'spearman', 'survey']).optional().describe('Grading algorithm: exact match, partial order, adjacent pairs, Spearman rank correlation, or survey (always correct)'),
  }).strict(),
});

export default SortableGrader;