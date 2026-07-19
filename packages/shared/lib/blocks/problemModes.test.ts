import { describe, expect, it } from 'vitest';
import { correctness } from './correctness';
import { shouldShowAnswer, type ProblemState } from './problemModes';

const state = (overrides: Partial<ProblemState> = {}): ProblemState => ({
  submitCount: 0,
  maxAttempts: null,
  correct: correctness.unsubmitted,
  ...overrides,
});

describe('showanswer modes', () => {
  it.each([
    ['no submission', state(), false],
    ['incorrect submission', state({ submitCount: 1, correct: correctness.incorrect }), true],
    ['correct submission', state({ submitCount: 1, correct: correctness.correct }), true],
  ])('shows an attempted answer after %s', (_case, problemState, expected) => {
    expect(shouldShowAnswer('attempted', problemState)).toBe(expected);
  });

  it('shows a correct answer only after a correct submission', () => {
    expect(shouldShowAnswer('correct', state({ submitCount: 1, correct: correctness.incorrect }))).toBe(false);
    expect(shouldShowAnswer('correct', state({ submitCount: 1, correct: correctness.correct }))).toBe(true);
  });

  it('defaults to attempted', () => {
    expect(shouldShowAnswer(undefined, state())).toBe(false);
    expect(shouldShowAnswer(undefined, state({ submitCount: 1, correct: correctness.incorrect }))).toBe(true);
  });
});
