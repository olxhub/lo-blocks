import { describe, expect, it } from 'vitest';
import { correctness } from './correctness';
import {
  conditionHolds, getAttemptsPresentation, isAnswerAutoRevealed,
  isInputLocked, shouldShowAnswer, type ProblemState,
} from './problemModes';

const state = (
  submitCount: number,
  correct = correctness.incorrect,
  maxAttempts: number | null = null,
): ProblemState => ({ submitCount, correct, maxAttempts });

describe('problem conditions', () => {
  it.each([
    ['always', state(0), true],
    ['never', state(1, correctness.correct), false],
    ['attempted', state(0), false],
    ['attempted', state(1), true],
    ['correct', state(1), false],
    ['correct', state(1, correctness.correct), true],
    ['closed', state(1, correctness.incorrect, 2), false],
    ['closed', state(2, correctness.incorrect, 2), true],
    ['finished', state(1, correctness.correct, 2), true],
  ] as const)('evaluates %s', (condition, problemState, expected) => {
    expect(conditionHolds(condition, problemState)).toBe(expected);
  });
});

describe('answer reveal and locking', () => {
  it('defaults to a button after an attempt and leaves input editable', () => {
    const attempted = state(1);
    expect(shouldShowAnswer(undefined, undefined, attempted)).toBe(true);
    expect(isAnswerAutoRevealed(undefined, undefined, attempted)).toBe(false);
    expect(isInputLocked(undefined, attempted)).toBe(false);
  });

  it('supports automatic reveal and a closed-attempt lock', () => {
    const closed = state(1, correctness.incorrect, 1);
    expect(shouldShowAnswer('attempted', 'auto', closed)).toBe(false);
    expect(isAnswerAutoRevealed('attempted', 'auto', closed)).toBe(true);
    expect(isInputLocked('closed', closed)).toBe(true);
  });
});

describe('attempts presentation', () => {
  it.each([
    [state(0), 'Check', null],
    [state(0, correctness.unsubmitted, 1), 'Submit', null],
    [state(0, correctness.unsubmitted, 3), 'Check', '3 attempts remaining'],
    [state(2, correctness.incorrect, 3), 'Submit', 'Final attempt'],
    [state(3, correctness.incorrect, 3), 'Submit', 'No attempts remaining'],
  ] as const)('presents attempt state %#', (problemState, label, attemptsText) => {
    expect(getAttemptsPresentation(problemState)).toEqual({ label, attemptsText });
  });
});
