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
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';
import { gradeMatching } from './gradingUtils';

export const fields = state.fields(['correct', 'message']);

const MatchingGrader = blocks.test({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({
    grader: gradeMatching,
  }),
  name: 'MatchingGrader',
  description: 'Grades matching exercises with partial credit support',
  category: 'grading',
  component: _Noop,
  fields,
  attributes: baseAttributes.extend({
    // Could add future attributes like grading algorithm, partial credit config, etc.
  }),
});

export default MatchingGrader;
