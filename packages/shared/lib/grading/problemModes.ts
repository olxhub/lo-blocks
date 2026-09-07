// packages/shared/lib/grading/problemModes.ts
//
// Utility functions for problem submission modes, attempts, and answer visibility.
//
// This module provides shared logic for:
// - When to show the "Show Answer" button (showanswer modes)
// - Button labels (Check vs Submit)
// - Attempts tracking and enforcement
//
// See docs/architecture/problem-submission-modes.md for design rationale.
//

import { correctness as correctnessEnum, completion, type Completion } from './correctness';
import { showAnswerModes, type ShowAnswerMode } from '../blocks/attributeSchemas';

// Re-export for consumers
export type { ShowAnswerMode };

// Future modes (require due date infrastructure):
// | 'past_due'           // After due date passes
// | 'correct_or_past_due' // After correct OR due date passes

/**
 * State needed to evaluate problem modes.
 */
export interface ProblemState {
  submitCount: number;
  maxAttempts: number | null;  // null = unlimited
  correct: string | null;      // Correctness state ('correct', 'incorrect', etc.)
}

/**
 * Derive a problem's COMPLETION (doneness) from its grading state.
 *
 * Correctness and doneness are orthogonal (see correctness.ts). A problem
 * can be incorrect AND done (one attempt allowed, got it wrong → closed);
 * it can be ungraded and closed (deadline passed — future). Progress bars,
 * gating, and Show Answer should ask this doneness question; feedback and
 * scoring ask the correctness question. Conflating the two is a classic
 * platform mistake — keep the axes separate.
 *
 *   done        - correct; nothing left to do
 *   closed      - can no longer be worked (attempts exhausted; future:
 *                 deadline passed). Not-done-but-can-no-longer-do: shows
 *                 differently in a progress bar than in content gating.
 *   inProgress  - attempted, still open
 *   notStarted  - no attempts
 */
export function problemCompletion(state: ProblemState): Completion {
  if (state.correct === correctnessEnum.correct) return completion.done;
  if (isAttemptsClosed(state)) return completion.closed;
  if (state.submitCount > 0) return completion.inProgress;
  return completion.notStarted;
}

/** Is the problem in a terminal doneness state (done or closed)? */
export function isProblemFinished(state: ProblemState): boolean {
  const c = problemCompletion(state);
  return c === completion.done || c === completion.closed;
}

/**
 * Determine if the Show Answer button should be visible.
 *
 * Each mode gates on ONE axis:
 * - 'attempted' — any recorded submission
 * - 'correct'   — CORRECTNESS axis: answered correctly
 * - 'closed'    — COMPLETION axis: can no longer be worked
 * - 'finished'  — COMPLETION axis: terminal (done or closed)
 *
 * @param mode - The showanswer mode from problem attributes
 * @param state - Current problem state
 * @returns true if Show Answer should be visible
 */
export function shouldShowAnswer(mode: ShowAnswerMode | string | undefined, state: ProblemState): boolean {
  // Default to 'attempted': reveal the answer after the learner has made a
  // real submission, without requiring correctness or exhausted attempts.
  const effectiveMode = (mode || 'attempted') as ShowAnswerMode;

  switch (effectiveMode) {
    case 'always':
      return true;

    case 'never':
      return false;

    case 'attempted':
      return state.submitCount > 0;

    case 'correct':
      return state.correct === correctnessEnum.correct;

    case 'closed':
      // Raw constraint check, not problemCompletion(): edX 'closed' means
      // "attempts used (future: or past due)" regardless of correctness —
      // a correct answer with attempts exhausted is done AND closed for
      // this purpose, but problemCompletion reports it as done.
      return isAttemptsClosed(state);

    case 'finished':
      return isProblemFinished(state);

    default:
      // Unknown mode - log warning and default to 'attempted' behavior
      console.warn(`Unknown showanswer mode: "${mode}", defaulting to 'attempted'`);
      return state.submitCount > 0;
  }
}

/**
 * Check if attempts are exhausted.
 *
 * COMPLETION-axis helper (feeds problemCompletion's 'closed'). Future
 * doneness constraints (due dates) belong here too, not in correctness.
 */
export function isAttemptsClosed(state: ProblemState): boolean {
  if (state.maxAttempts === null || state.maxAttempts === undefined) {
    return false;  // Unlimited attempts - never closed
  }
  return state.submitCount >= state.maxAttempts;
}

/**
 * Check if the submit/check button should be disabled.
 *
 * Disabled when attempts are exhausted, or while a async grader is
 * grading the current submission — resubmitting mid-flight would launch a
 * duplicate grading call (e.g. a second LLM request) and burn an attempt.
 */
export function isSubmitDisabled(state: ProblemState): boolean {
  return isAttemptsClosed(state) || state.correct === correctnessEnum.submitted;
}

/**
 * Footer presentation for a problem: action-button label and attempts text.
 *
 * One table, one place. `remaining` is maxAttempts - submitCount.
 *
 *   attempts limit   state              button    attempts text
 *   ---------------  -----------------  --------  ----------------------
 *   unlimited        any                Check     (none)
 *   exactly 1        before submission  Submit    (none)
 *   exactly 1        exhausted          Submit    (none)
 *   more than 1      remaining > 1      Check     "N attempts remaining"
 *   more than 1      remaining === 1    Submit    "Final attempt"
 *   more than 1      exhausted          Submit    "No attempts remaining"
 *
 * A single-attempt problem never shows attempts text: with one attempt there
 * is nothing to count down, before or after it is used — "1 attempt
 * remaining" and "No attempts remaining" are both noise there. The button
 * carries the whole story ("Submit", disabled once used — isSubmitDisabled).
 *
 * The label is deliberately bare ("Check", not "Check (2/3)"): the attempts
 * text next to it already carries the count.
 */
export interface AttemptsPresentation {
  /** Action-button label. */
  label: string;
  /** Attempts status text, or null when there is nothing worth saying. */
  attemptsText: string | null;
}

export function getAttemptsPresentation(state: ProblemState): AttemptsPresentation {
  const { submitCount, maxAttempts } = state;

  // Unlimited attempts — nothing to count.
  if (maxAttempts === null || maxAttempts === undefined) {
    return { label: 'Check', attemptsText: null };
  }

  // One attempt — one shot, no countdown, before or after it is used.
  if (maxAttempts === 1) {
    return { label: 'Submit', attemptsText: null };
  }

  const remaining = maxAttempts - submitCount;

  if (remaining <= 0) {
    return { label: 'Submit', attemptsText: 'No attempts remaining' };
  }

  if (remaining === 1) {
    return { label: 'Submit', attemptsText: 'Final attempt' };
  }

  return { label: 'Check', attemptsText: `${remaining} attempts remaining` };
}

/**
 * Parse maxAttempts from string attribute to number or null.
 */
export function parseMaxAttempts(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') {
    return null;  // Unlimited
  }

  const num = typeof value === 'number' ? value : parseInt(value, 10);

  if (isNaN(num) || num <= 0) {
    return null;  // Invalid or zero = unlimited
  }

  return num;
}

/**
 * All valid showanswer mode values (for validation/documentation).
 * Re-exported from attributeSchemas for convenience.
 */
export const SHOWANSWER_MODES = showAnswerModes;

/**
 * Check if a string is a valid showanswer mode.
 */
export function isValidShowAnswerMode(mode: string): mode is ShowAnswerMode {
  return (showAnswerModes as readonly string[]).includes(mode);
}
