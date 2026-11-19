// packages/shared/lib/grading/problemModes.ts
//
// Shared decisions for attempts, answer visibility, and input locking.

import { correctness as correctnessEnum, completion, type Completion } from './correctness';
import {
  type AnswerRevealMode, type ProblemCondition, type ShowAnswerMode,
} from '../blocks/attributeSchemas';

// Re-export for consumers
export type { AnswerRevealMode, ProblemCondition, ShowAnswerMode };

const DEFAULT_SHOW_ANSWER: ProblemCondition = 'attempted';
const DEFAULT_LOCK_INPUT: ProblemCondition = 'never';
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

/** Evaluate the condition vocabulary shared by showAnswer and lockInput. */
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
      console.warn(`Unknown problem condition: "${condition}"`);
      return false;
  }
}

export function shouldShowAnswer(
  mode: ShowAnswerMode | string | undefined,
  reveal: AnswerRevealMode | string | undefined,
  state: ProblemState,
): boolean {
  return (reveal ?? DEFAULT_ANSWER_REVEAL) === 'button'
    && conditionHolds(mode ?? DEFAULT_SHOW_ANSWER, state);
}

export function isAnswerAutoRevealed(
  mode: ShowAnswerMode | string | undefined,
  reveal: AnswerRevealMode | string | undefined,
  state: ProblemState,
): boolean {
  return reveal === 'auto' && conditionHolds(mode ?? DEFAULT_SHOW_ANSWER, state);
}

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

/** Keep the action label and adjacent attempts text in one decision table. */
export interface AttemptsPresentation {
  /** Action-button label. */
  label: string;
  /** Attempts status text, or null when there is nothing worth saying. */
  attemptsText: string | null;
}

export function getAttemptsPresentation(state: ProblemState): AttemptsPresentation {
  const { submitCount, maxAttempts } = state;

  if (maxAttempts === null || maxAttempts === undefined) {
    return { label: 'Check', attemptsText: null };
  }

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
