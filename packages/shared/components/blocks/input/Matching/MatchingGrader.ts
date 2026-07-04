/**
 * MatchingGrader - grades MatchingInput exercises
 *
 * Usage:
 *   <MatchingGrader>
 *     <MatchingInput>
 *       <Markdown>1683</Markdown>
 *       <Markdown>Battle for Vienna</Markdown>
 *       ...
 *     </MatchingInput>
 *   </MatchingGrader>
 *
 * Supports partial credit: gives points for each correct match
 * Score = (correct matches) / (total pairs)
 */

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { gradeMatching } from './gradingUtils';

export const fields = state.fields(state.graderFields());

const MatchingGrader = blocks.test({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({
    grader: gradeMatching,
  }),
  name: 'MatchingGrader',
  description: 'Grades matching exercises with partial credit support',
  category: 'grading',
  // Non-conventional: reuses the shared layout Noop renderer.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  attributes: z.object({
    // Could add future attributes like grading algorithm, partial credit config, etc.
  }).strict(),
});

export default MatchingGrader;
