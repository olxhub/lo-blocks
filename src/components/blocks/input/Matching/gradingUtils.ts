/**
 * Grading logic for matching exercises
 */

import { CORRECTNESS } from '@/lib/blocks/correctness';
import type { MatchingArrangement, MatchingGradingResult } from './types';

/**
 * Grade a matching arrangement
 * Called by the grader framework with (props, { input, inputApi })
 *
 * @param props Grader props
 * @param input Object containing arrangement from MatchingInput.getValue()
 * @param inputApi API from MatchingInput with getCorrectArrangement method
 * @returns Object with correct, score, message
 */
export function gradeMatching(props: any, { input, inputApi }: any) {
  const studentArrangement = input.arrangement;

  // Get correct arrangement from the input block's locals
  const correctArrangement = inputApi.getCorrectArrangement();

  const totalMatches = Object.keys(correctArrangement).length;

  // Count correct matches
  let correctMatches = 0;
  for (const [leftId, rightId] of Object.entries(correctArrangement)) {
    if (studentArrangement[leftId] === rightId) {
      correctMatches++;
    }
  }

  const score = totalMatches > 0 ? correctMatches / totalMatches : 0;

  // Determine correctness
  let correct: string;
  if (score === 1) {
    correct = CORRECTNESS.CORRECT;
  } else if (correctMatches === 0) {
    correct = CORRECTNESS.INCORRECT;  // No correct matches (including blank) = incorrect
  } else {
    correct = CORRECTNESS.PARTIALLY_CORRECT;  // Some but not all correct
  }

  return {
    correct,
    score,
    message: `${correctMatches}/${totalMatches} correct`,
  };
}

/**
 * Build the correct arrangement from left/right items
 * Left items (odd indices) map to right items (even indices that follow)
 * @param kids All children from parser (alternating left, right, left, right, ...)
 * @returns Object mapping left item IDs to their correct right item IDs
 */
export function buildCorrectArrangement(kids: any[]): MatchingArrangement {
  const correct: MatchingArrangement = {};

  // Iterate through pairs: left (i) pairs with right (i+1)
  for (let i = 0; i < kids.length - 1; i += 2) {
    const leftItem = kids[i];
    const rightItem = kids[i + 1];

    correct[leftItem.id] = rightItem.id;
  }

  return correct;
}
