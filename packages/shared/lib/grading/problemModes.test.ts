import { describe, expect, it } from 'vitest';
import { correctness } from './correctness';
import { getAttemptsPresentation, shouldShowAnswer, type ProblemState } from './problemModes';

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

// Decision table for getAttemptsPresentation: every row is a complete input
// combination (attempts limit, submissions made, correctness) and the complete
// footer presentation it produces. Mirrors the table in problemModes.ts.
//
// Rows worth reading twice:
// - maxAttempts 1 shows no attempts text in any state; "1 attempt remaining"
//   and "No attempts remaining" are both noise when there is one shot.
// - submitCount past maxAttempts stays on the exhausted row.
// - correctness never moves the label or the count; it is a separate axis.
interface AttemptsRow extends ProblemState {
  label: string;
  attemptsText: string | null;
}

const attemptsRows: AttemptsRow[] = [
  { maxAttempts: null, submitCount: 0, correct: correctness.unsubmitted, label: 'Check',  attemptsText: null                    },
  { maxAttempts: null, submitCount: 7, correct: correctness.unsubmitted, label: 'Check',  attemptsText: null                    },
  { maxAttempts: 1,    submitCount: 0, correct: correctness.unsubmitted, label: 'Submit', attemptsText: null                    },
  { maxAttempts: 1,    submitCount: 1, correct: correctness.unsubmitted, label: 'Submit', attemptsText: null                    },
  { maxAttempts: 2,    submitCount: 0, correct: correctness.unsubmitted, label: 'Check',  attemptsText: '2 attempts remaining'  },
  { maxAttempts: 2,    submitCount: 1, correct: correctness.unsubmitted, label: 'Submit', attemptsText: 'Final attempt'         },
  { maxAttempts: 2,    submitCount: 2, correct: correctness.unsubmitted, label: 'Submit', attemptsText: 'No attempts remaining' },
  { maxAttempts: 2,    submitCount: 5, correct: correctness.unsubmitted, label: 'Submit', attemptsText: 'No attempts remaining' },
  { maxAttempts: 3,    submitCount: 0, correct: correctness.unsubmitted, label: 'Check',  attemptsText: '3 attempts remaining'  },
  { maxAttempts: 3,    submitCount: 1, correct: correctness.unsubmitted, label: 'Check',  attemptsText: '2 attempts remaining'  },
  { maxAttempts: 3,    submitCount: 1, correct: correctness.incorrect,   label: 'Check',  attemptsText: '2 attempts remaining'  },
  { maxAttempts: 3,    submitCount: 2, correct: correctness.unsubmitted, label: 'Submit', attemptsText: 'Final attempt'         },
];

describe('attempts presentation', () => {
  it.each(attemptsRows)(
    'maxAttempts=$maxAttempts submitCount=$submitCount correct=$correct reads $label / $attemptsText',
    ({ maxAttempts, submitCount, correct, label, attemptsText }) => {
      expect(getAttemptsPresentation({ maxAttempts, submitCount, correct }))
        .toEqual({ label, attemptsText });
    },
  );
});
