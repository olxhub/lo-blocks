// packages/shared/lib/blocks/problemModes.ts
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
import { showAnswerModes, type ShowAnswerMode } from './attributeSchemas';

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
 * - 'attempted' — interaction happened (completion ≥ inProgress)
 * - 'answered'  — any recorded submission. This is the edX-legacy mode;
 *   it does NOT mean answered correctly. It aligns with Explanation
 *   showWhen="answered" — see visibilityHandlers in correctness.ts.
 * - 'closed'    — COMPLETION axis: can no longer be worked
 * - 'finished'  — COMPLETION axis: terminal (done or closed)
 *
 * @param mode - The showanswer mode from problem attributes
 * @param state - Current problem state
 * @returns true if Show Answer should be visible
 */
export function shouldShowAnswer(mode: ShowAnswerMode | string | undefined, state: ProblemState): boolean {
  // Default to 'finished' if not specified (reasonable default)
  const effectiveMode = (mode || 'finished') as ShowAnswerMode;

  switch (effectiveMode) {
    case 'always':
      return true;

    case 'never':
      return false;

    case 'attempted':
      return problemCompletion(state) !== completion.notStarted;

    case 'answered':
      return state.submitCount > 0;

    case 'closed':
      // Raw constraint check, not problemCompletion(): edX 'closed' means
      // "attempts used (future: or past due)" regardless of correctness —
      // a correct answer with attempts exhausted is done AND closed for
      // this purpose, but problemCompletion reports it as done.
      return isAttemptsClosed(state);

    case 'finished':
      return isProblemFinished(state);

    default:
      // Unknown mode - log warning and default to 'finished' behavior
      console.warn(`Unknown showanswer mode: "${mode}", defaulting to 'finished'`);
      return isProblemFinished(state);
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
 * Disabled when attempts are exhausted, or while a slow (async) grader is
 * grading the current submission — resubmitting mid-flight would launch a
 * duplicate grading call (e.g. a second LLM request) and burn an attempt.
 */
export function isSubmitDisabled(state: ProblemState): boolean {
  return isAttemptsClosed(state) || state.correct === correctnessEnum.submitted;
}

/**
 * Get the appropriate button label based on problem state.
 *
 * Pattern:
 * - Unlimited attempts: "Check"
 * - Single attempt: "Submit"
 * - Multiple attempts, not final: "Check" or "Check (X/Y)"
 * - Multiple attempts, final: "Submit"
 * - Attempts exhausted: "Submit" (button will be disabled)
 *
 * @param state - Current problem state
 * @param options - Display options
 * @returns Button label string
 */
export function getButtonLabel(
  state: ProblemState,
  options: { showCount?: boolean } = {}
): string {
  const { submitCount, maxAttempts } = state;
  const { showCount = true } = options;

  // Unlimited attempts
  if (maxAttempts === null || maxAttempts === undefined) {
    return 'Check';
  }

  // Single attempt
  if (maxAttempts === 1) {
    return 'Submit';
  }

  // Multiple attempts - check if this is the final one
  const attemptsRemaining = maxAttempts - submitCount;

  if (attemptsRemaining <= 1) {
    // Final attempt (or already exhausted)
    return 'Submit';
  }

  // Not final - show Check with optional count
  if (showCount) {
    return `Check (${submitCount + 1}/${maxAttempts})`;
  }

  return 'Check';
}

/**
 * Get a display string for attempts status.
 *
 * @param state - Current problem state
 * @returns Display string like "2 of 3 attempts used" or null for unlimited
 */
export function getAttemptsDisplay(state: ProblemState): string | null {
  const { submitCount, maxAttempts } = state;

  // Unlimited attempts - no display needed
  if (maxAttempts === null || maxAttempts === undefined) {
    return null;
  }

  const remaining = maxAttempts - submitCount;

  if (remaining <= 0) {
    return 'No attempts remaining';
  }

  if (remaining === 1) {
    return '1 attempt remaining';
  }

  return `${remaining} attempts remaining`;
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
