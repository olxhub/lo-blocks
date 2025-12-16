// src/lib/grading/aggregators.ts
//
// Correctness aggregation strategies for combining results from multiple graders.
//
// This is the foundation of a grading subsystem. Different contexts need different
// aggregation strategies:
//
// - worstCaseCorrectness: Any wrong = wrong (strict, good for prerequisite skills)
// - allCorrectRequired: Must get everything right for credit (mastery-based)
// - proportionalCorrectness: Partial credit based on fraction correct
//
// Future strategies might include:
// - weightedCorrectness: Different items have different weights
// - itemResponseTheory: Statistical models for adaptive assessment
// - raschModel: Probabilistic measurement model
// - discountedCorrectness: Reduce credit after deadline or retries
//
// The goal is instructor-friendly aggregation that can express things like
// "assignment grade = all CapaProblems in this vertical" and support
// progress introspection.

import {
  CORRECTNESS,
  validateCorrectness,
  getAllCorrectnessStates
} from '@/lib/blocks/correctness';

// Type for counts keyed by correctness value
type CorrectnessCounts = Record<string, number> & { total: number };

/**
 * Count occurrences of each correctness state.
 * Throws on invalid state values (fail-fast).
 */
export function countCorrectness(values: string[]): CorrectnessCounts {
  const allStates = getAllCorrectnessStates();

  // Initialize counts for all known states to 0
  const counts: CorrectnessCounts = { total: values.length };
  for (const state of allStates) {
    counts[state] = 0;
  }

  // Count each value, validating as we go
  for (const v of values) {
    validateCorrectness(v);
    counts[v]++;
  }

  return counts;
}

/**
 * Worst-case aggregation: returns the "worst" correctness state.
 *
 * Priority (worst to best):
 *   INVALID > UNSUBMITTED > INCOMPLETE > SUBMITTED > INCORRECT > PARTIALLY_CORRECT > CORRECT
 *
 * Use case: Strict prerequisite checking where any failure blocks progress.
 */
export function worstCaseCorrectness(values: string[]): string {
  if (!values || values.length === 0) {
    return CORRECTNESS.UNSUBMITTED;
  }

  const counts = countCorrectness(values);

  // Invalid blocks everything
  if (counts[CORRECTNESS.INVALID] > 0) return CORRECTNESS.INVALID;

  // Any unsubmitted means not started
  if (counts[CORRECTNESS.UNSUBMITTED] > 0) return CORRECTNESS.UNSUBMITTED;

  // Any incomplete means partially done
  if (counts[CORRECTNESS.INCOMPLETE] > 0) return CORRECTNESS.INCOMPLETE;

  // Any submitted but not graded means waiting
  if (counts[CORRECTNESS.SUBMITTED] > 0) return CORRECTNESS.SUBMITTED;

  // Any incorrect means incorrect (or partial if some correct)
  if (counts[CORRECTNESS.INCORRECT] > 0) {
    return counts[CORRECTNESS.CORRECT] > 0 ? CORRECTNESS.PARTIALLY_CORRECT : CORRECTNESS.INCORRECT;
  }

  // Any partial means partial
  if (counts[CORRECTNESS.PARTIALLY_CORRECT] > 0) return CORRECTNESS.PARTIALLY_CORRECT;

  // All correct
  return CORRECTNESS.CORRECT;
}

/**
 * Proportional aggregation: returns state based on fraction correct.
 *
 * - All correct → CORRECT
 * - All incorrect → INCORRECT
 * - Mixed → PARTIALLY_CORRECT
 * - Any unsubmitted/incomplete/submitted → that state (not final)
 *
 * Use case: Traditional grading where partial credit matters.
 */
export function proportionalCorrectness(values: string[]): string {
  if (!values || values.length === 0) {
    return CORRECTNESS.UNSUBMITTED;
  }

  const counts = countCorrectness(values);

  if (counts[CORRECTNESS.INVALID] > 0) return CORRECTNESS.INVALID;
  if (counts[CORRECTNESS.UNSUBMITTED] > 0) return CORRECTNESS.UNSUBMITTED;
  if (counts[CORRECTNESS.INCOMPLETE] > 0) return CORRECTNESS.INCOMPLETE;
  if (counts[CORRECTNESS.SUBMITTED] > 0) return CORRECTNESS.SUBMITTED;
  if (counts[CORRECTNESS.CORRECT] === counts.total) return CORRECTNESS.CORRECT;
  if (counts[CORRECTNESS.INCORRECT] === counts.total) return CORRECTNESS.INCORRECT;

  return CORRECTNESS.PARTIALLY_CORRECT;
}

/**
 * Compute a numeric score (0-1) from correctness values.
 *
 * - CORRECT = 1
 * - PARTIALLY_CORRECT = 0.5 (could be customized)
 * - INCORRECT = 0
 * - UNSUBMITTED/INVALID = not counted as attempted
 *
 * Returns { score, attempted, total }
 */
export function computeScore(values: string[]): { score: number; attempted: number; total: number } {
  if (!values || values.length === 0) {
    return { score: 0, attempted: 0, total: 0 };
  }

  const counts = countCorrectness(values);
  const correct = counts[CORRECTNESS.CORRECT];
  const partial = counts[CORRECTNESS.PARTIALLY_CORRECT];
  const incorrect = counts[CORRECTNESS.INCORRECT];

  const attempted = correct + partial + incorrect;
  const score = correct + (partial * 0.5);

  return {
    score: counts.total > 0 ? score / counts.total : 0,
    attempted,
    total: counts.total
  };
}

/**
 * Format score for display (e.g., "2/3" or "67%")
 */
export function formatScore(
  values: string[],
  format: 'fraction' | 'percent' = 'fraction'
): string {
  if (!values || values.length === 0) {
    return format === 'percent' ? '0%' : '0/0';
  }

  const counts = countCorrectness(values);
  const correct = counts[CORRECTNESS.CORRECT];

  if (format === 'percent') {
    const pct = counts.total > 0 ? Math.round((correct / counts.total) * 100) : 0;
    return `${pct}%`;
  }

  return `${correct}/${counts.total}`;
}
