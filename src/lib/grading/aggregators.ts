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
  correctness,
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
 *   invalid > unsubmitted > incomplete > submitted > incorrect > partiallyCorrect > correct
 *
 * Use case: Strict prerequisite checking where any failure blocks progress.
 */
export function worstCaseCorrectness(values: string[]): string {
  if (!values || values.length === 0) {
    return correctness.unsubmitted;
  }

  const counts = countCorrectness(values);

  // Invalid blocks everything
  if (counts[correctness.invalid] > 0) return correctness.invalid;

  // Any unsubmitted means not started
  if (counts[correctness.unsubmitted] > 0) return correctness.unsubmitted;

  // Any incomplete means partially done
  if (counts[correctness.incomplete] > 0) return correctness.incomplete;

  // Any submitted but not graded means waiting
  if (counts[correctness.submitted] > 0) return correctness.submitted;

  // Any incorrect means incorrect (or partial if some correct)
  if (counts[correctness.incorrect] > 0) {
    return counts[correctness.correct] > 0 ? correctness.partiallyCorrect : correctness.incorrect;
  }

  // Any partial means partial
  if (counts[correctness.partiallyCorrect] > 0) return correctness.partiallyCorrect;

  // All correct
  return correctness.correct;
}

/**
 * Proportional aggregation: returns state based on fraction correct.
 *
 * - All correct → correctness.correct
 * - All incorrect → correctness.incorrect
 * - Mixed → correctness.partiallyCorrect
 * - Any unsubmitted/incomplete/submitted → that state (not final)
 *
 * Use case: Traditional grading where partial credit matters.
 */
export function proportionalCorrectness(values: string[]): string {
  if (!values || values.length === 0) {
    return correctness.unsubmitted;
  }

  const counts = countCorrectness(values);

  if (counts[correctness.invalid] > 0) return correctness.invalid;
  if (counts[correctness.unsubmitted] > 0) return correctness.unsubmitted;
  if (counts[correctness.incomplete] > 0) return correctness.incomplete;
  if (counts[correctness.submitted] > 0) return correctness.submitted;
  if (counts[correctness.correct] === counts.total) return correctness.correct;
  if (counts[correctness.incorrect] === counts.total) return correctness.incorrect;

  return correctness.partiallyCorrect;
}

/**
 * Compute a numeric score (0-1) from correctness values.
 *
 * - correctness.correct = 1
 * - correctness.partiallyCorrect = 0.5 (could be customized)
 * - correctness.incorrect = 0
 * - unsubmitted/invalid = not counted as attempted
 *
 * Returns { score, attempted, total }
 */
export function computeScore(values: string[]): { score: number; attempted: number; total: number } {
  if (!values || values.length === 0) {
    return { score: 0, attempted: 0, total: 0 };
  }

  const counts = countCorrectness(values);
  const correct = counts[correctness.correct];
  const partial = counts[correctness.partiallyCorrect];
  const incorrect = counts[correctness.incorrect];

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
  const correct = counts[correctness.correct];

  if (format === 'percent') {
    const pct = counts.total > 0 ? Math.round((correct / counts.total) * 100) : 0;
    return `${pct}%`;
  }

  return `${correct}/${counts.total}`;
}
