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
import { dev, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import type { RuntimeProps } from '@/lib/types';
import type { MatchingArrangement } from './types';
import { shallowEqual } from 'react-redux';

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

    // Until KidKey lands, the child definition key is also the matching-item identity.
    correct[leftKid.definitionKey] = rightKid.definitionKey;
  }

  return correct;
}

// shallowEqual gates one level deep (Object.is per key) — a fresh {} fallback
// per evaluation would fail that check and re-render unanswered blocks on
// every dispatch.
const EMPTY_ARRANGEMENT: Record<string, string> = {};

const MatchingInput = dev({
  ...parsers.blocks(), // Handle child blocks
  ...input(),
  name: 'MatchingInput',
  description: 'Match items from left column to right column',
  fields,
  selectors: {
    value: {
      select: (reduxState, props: RuntimeProps, _stateKey) => ({
        arrangement: fieldSelector(reduxState, props, fields.arrangement, { fallback: EMPTY_ARRANGEMENT })
      }),
      // Fresh object per evaluation — subscribers gate on content.
      equality: shallowEqual,
    },
  },
  attributes: z.object({
    shuffle: z.coerce.boolean().optional().describe('Whether to shuffle right side items initially (default: true)'),
  }).strict(),
  locals: {
    getCorrectArrangement
  }
});

export default MatchingInput;
