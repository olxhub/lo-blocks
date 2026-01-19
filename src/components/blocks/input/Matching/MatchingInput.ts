/**
 * MatchingInput block - allows students to match items from left to right
 *
 * Usage:
 *   <MatchingInput>
 *     <Markdown>1683</Markdown>
 *     <Markdown>Battle for Vienna</Markdown>
 *     <Markdown>1492</Markdown>
 *     <Markdown>Columbus</Markdown>
 *   </MatchingInput>
 *
 * Alternates left/right: items at indices 0, 2, 4, ... are left side
 * Items at indices 1, 3, 5, ... are right side
 *
 * Optional: Use initialPosition attribute on items to control display order
 * Optional: Use explicit id attributes for easier debugging
 */

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _MatchingInput from './_MatchingInput';
import type { RuntimeProps } from '@/lib/types';
import type { MatchingArrangement } from './types';

export const fields = state.fields([
  'arrangement',  // Current matching: left item ID → right item ID
  'selectedId',   // Currently selected item ID for matching
  'selectedSide', // Side of selected item: 'start' | 'end'
  'endOrder'      // Display order of end-side items (indices into pairs array, fixed after initial shuffle)
]);

/**
 * Get the correct matching arrangement
 * Extracts from kids: left items (index 0,2,4,...) map to right items (index 1,3,5,...)
 */
function getCorrectArrangement(props: RuntimeProps) {
  const correct: MatchingArrangement = {};
  const kids = props.kids as any[] || [];

  for (let i = 0; i < kids.length - 1; i += 2) {
    const leftKid = kids[i];
    const rightKid = kids[i + 1];

    // Kids are guaranteed to be block references with IDs
    correct[leftKid.id] = rightKid.id;
  }

  return correct;
}

const MatchingInput = dev({
  ...parsers.blocks(), // Handle child blocks
  name: 'MatchingInput',
  description: 'Match items from left column to right column',
  component: _MatchingInput,
  fields,
  getValue: (props: RuntimeProps, reduxState, id) => ({
    arrangement: fieldSelector(reduxState, { ...props, id }, fields.arrangement, { fallback: {} })
  }),
  attributes: baseAttributes.extend({
    shuffle: z.coerce.boolean().optional().describe('Whether to shuffle right side items initially (default: true)'),
  }),
  locals: {
    getCorrectArrangement
  }
});

export default MatchingInput;
