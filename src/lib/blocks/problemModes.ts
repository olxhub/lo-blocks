// src/lib/blocks/problemModes.ts
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

import { correctness as correctnessEnum } from './correctness';

/**
 * Show answer modes - when the Show Answer button becomes available.
 *
 * Modes requiring due dates (past_due, correct_or_past_due) are not yet implemented.
 */
export type ShowAnswerMode =
  | 'always'     // Always visible
  | 'never'      // Never visible
  | 'attempted'  // After first attempt (submitCount > 0)
  | 'answered'   // After correct answer
  | 'closed'     // After attempts exhausted (submitCount >= maxAttempts)
  | 'finished';  // answered OR closed

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
 * Determine if the Show Answer button should be visible.
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
      return state.submitCount > 0;

    case 'answered':
      return state.correct === correctnessEnum.correct;

    case 'closed':
      return isAttemptsClosed(state);

    case 'finished':
      return state.correct === correctnessEnum.correct || isAttemptsClosed(state);

    default:
      // Unknown mode - log warning and default to 'finished' behavior
      console.warn(`Unknown showanswer mode: "${mode}", defaulting to 'finished'`);
      return state.correct === correctnessEnum.correct || isAttemptsClosed(state);
  }
}

/**
 * Check if attempts are exhausted.
 */
export function isAttemptsClosed(state: ProblemState): boolean {
  if (state.maxAttempts === null || state.maxAttempts === undefined) {
    return false;  // Unlimited attempts - never closed
  }
  return state.submitCount >= state.maxAttempts;
}

/**
 * Check if the submit/check button should be disabled.
 */
export function isSubmitDisabled(state: ProblemState): boolean {
  return isAttemptsClosed(state);
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
 */
export const SHOWANSWER_MODES: ShowAnswerMode[] = [
  'always',
  'never',
  'attempted',
  'answered',
  'closed',
  'finished',
];

/**
 * Check if a string is a valid showanswer mode.
 */
export function isValidShowAnswerMode(mode: string): mode is ShowAnswerMode {
  return SHOWANSWER_MODES.includes(mode as ShowAnswerMode);
}
