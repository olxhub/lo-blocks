import { describe, expect, it } from 'vitest';
import { completion, correctness } from './correctness';
import { problemCompletion, shouldShowAnswer, type ProblemState } from './problemModes';

const state = (overrides: Partial<ProblemState> = {}): ProblemState => ({
  submitCount: 0,
  maxAttempts: null,
  correct: correctness.unsubmitted,
  ...overrides,
});

describe('problemCompletion', () => {
  it('is done after a give-up, without a correct answer', () => {
    expect(problemCompletion(state({ correct: correctness.gaveUp, submitCount: 1 }))).toBe(completion.done);
    expect(problemCompletion(state({ correct: correctness.incorrect, submitCount: 1 }))).toBe(completion.inProgress);
  });
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

  it('keeps the button after a give-up, whatever the mode but never', () => {
    const gaveUp = state({ correct: correctness.gaveUp });
    for (const mode of [undefined, 'attempted', 'correct', 'closed', 'finished']) {
      expect(shouldShowAnswer(mode, gaveUp), String(mode)).toBe(true);
    }
    expect(shouldShowAnswer('never', gaveUp)).toBe(false);
  });

  it('defaults to attempted', () => {
    expect(shouldShowAnswer(undefined, state())).toBe(false);
    expect(shouldShowAnswer(undefined, state({ submitCount: 1, correct: correctness.incorrect }))).toBe(true);
  });
});
