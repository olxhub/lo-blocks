// packages/shared/lib/grading/problemModes.ts
//
// Utility functions for problem submission modes, attempts, and answer visibility.
//
// This module provides shared logic for:
// - Whether a problem condition holds (conditionHolds — the one evaluator)
// - Whether the Show Answer button is offered, and whether the answer is
//   instead revealed automatically (showAnswer + answerReveal)
// - Whether inputs still accept changes (lockInput)
// - Button labels (Check vs Submit)
// - Attempts tracking and enforcement
//
// ONE VOCABULARY. showAnswer and lockInput both name a condition from
// attributeSchemas.problemConditions, and conditionHolds answers all of them:
//
//   condition    holds
//   ----------   -------------------------------------------
//   always       from the start
//   never        at no point
//   attempted    once a submission is recorded
//   correct      once the answer is correct
//   closed       once attempts are exhausted
//   finished     once correct or closed
//
// The attributes then differ only in what the condition governs:
//
//   attribute      default      the condition governs
//   ------------   ----------   -----------------------------------------
//   showAnswer     attempted    when the answer becomes available
//   lockInput      never        when inputs stop accepting changes
//
// answerReveal says HOW an available answer arrives: "button" (default —
// a Show Answer button appears, shouldShowAnswer) or "auto" (it is revealed
// with no button, ever — isAnswerAutoRevealed).
//
// maxAttempts="1" showAnswer="attempted" answerReveal="auto" lockInput="closed"
// is the one-submission assessment item: the answer appears with the result,
// and what is on screen stays what was scored.
//
// See the "Attempts, Answers, and Locking" section of
// components/blocks/CapaProblem/CapaProblem.md for the authoring view.
//

import { correctness as correctnessEnum, completion, type Completion } from './correctness';
import {
  showAnswerModes, type AnswerRevealMode, type ProblemCondition, type ShowAnswerMode,
} from '../blocks/attributeSchemas';

// Re-export for consumers
export type { AnswerRevealMode, ProblemCondition, ShowAnswerMode };

/** showAnswer says nothing → the answer becomes available once attempted. */
const DEFAULT_SHOW_ANSWER: ProblemCondition = 'attempted';
/** lockInput says nothing → inputs stay editable. */
const DEFAULT_LOCK_INPUT: ProblemCondition = 'never';
/** answerReveal says nothing → the learner presses a button for the answer. */
const DEFAULT_ANSWER_REVEAL: AnswerRevealMode = 'button';

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
 * Does a problem condition hold for this state?
 *
 * The one evaluator behind every "when" attribute (showAnswer, lockInput).
 * Each condition gates on ONE axis:
 * - 'always' / 'never' — no axis at all
 * - 'attempted' — any recorded submission
 * - 'correct'   — CORRECTNESS axis: answered correctly
 * - 'closed'    — COMPLETION axis: can no longer be worked
 * - 'finished'  — COMPLETION axis: terminal (done or closed)
 *
 * @param condition - A value from attributeSchemas.problemConditions
 * @param state - Current problem state
 */
export function conditionHolds(condition: ProblemCondition | string, state: ProblemState): boolean {
  switch (condition) {
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
      // Zod rejects unknown values at parse time; reaching here means content
      // bypassed the schema. Hold nothing rather than guess.
      console.warn(`Unknown problem condition: "${condition}"`);
      return false;
  }
}

/**
 * Determine if the Show Answer button should be visible.
 *
 * Two things must be true: the answer is available (the showAnswer condition
 * holds) AND the answer arrives by button. answerReveal="auto" means there is
 * no button to show, before or after the condition holds.
 */
export function shouldShowAnswer(
  mode: ShowAnswerMode | string | undefined,
  reveal: AnswerRevealMode | string | undefined,
  state: ProblemState,
): boolean {
  return (reveal ?? DEFAULT_ANSWER_REVEAL) === 'button'
    && conditionHolds(mode ?? DEFAULT_SHOW_ANSWER, state);
}

/**
 * Is the answer revealed without the learner pressing anything?
 *
 * answerReveal="auto" and the showAnswer condition holds. The counterpart of
 * shouldShowAnswer: exactly one of the two can be true at a time.
 */
export function isAnswerAutoRevealed(
  mode: ShowAnswerMode | string | undefined,
  reveal: AnswerRevealMode | string | undefined,
  state: ProblemState,
): boolean {
  return reveal === 'auto' && conditionHolds(mode ?? DEFAULT_SHOW_ANSWER, state);
}

/**
 * Are this problem's inputs read-only?
 *
 * The same conditions, read as "when does editing stop": 'attempted' locks on
 * the first submission, 'closed' on the last one, 'finished' on either that or
 * a correct answer, 'correct' once it is right, and 'always' never lets the
 * learner type at all. A one-attempt problem makes 'attempted' and 'closed'
 * coincide.
 *
 * A missing lockInput is 'never': content that says nothing about locking keeps
 * the editable-forever behaviour it has always had.
 */
export function isInputLocked(mode: ProblemCondition | string | undefined, state: ProblemState): boolean {
  return conditionHolds(mode ?? DEFAULT_LOCK_INPUT, state);
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
 * All valid showAnswer mode values (for validation/documentation).
 * Re-exported from attributeSchemas for convenience.
 */
export const SHOWANSWER_MODES = showAnswerModes;

/**
 * Check if a string is a valid showAnswer mode.
 */
export function isValidShowAnswerMode(mode: string): mode is ShowAnswerMode {
  return (showAnswerModes as readonly string[]).includes(mode);
}
