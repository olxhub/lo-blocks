import { describe, expect, it } from 'vitest';
import { correctness } from './correctness';
import {
  getAttemptsPresentation, isAnswerAutoRevealed, isInputLocked, shouldShowAnswer,
  type AnswerRevealMode, type ProblemCondition, type ProblemState, type ShowAnswerMode,
} from './problemModes';

// Answer visibility: one row per (showAnswer, answerReveal, state) combination
// and both answers it decides. `button` is whether the Show Answer button is
// offered; `revealed` is whether the answer is showing with nothing pressed.
// The showAnswer condition says WHEN the answer is available; answerReveal
// says which of the two columns that availability lands in.
//
//              [ showAnswer, answerReveal, maxAttempts, submitCount, correct, button, revealed ]
type ShowAnswerRow = [
  ShowAnswerMode | undefined, AnswerRevealMode | undefined,
  number | null, number, string, boolean, boolean,
];

const UNSUBMITTED = correctness.unsubmitted;
const INCORRECT   = correctness.incorrect;
const CORRECT     = correctness.correct;

const showAnswerRows: ShowAnswerRow[] = [
  ['always',    'button', null, 0, UNSUBMITTED, true,  false],
  ['always',    'auto',   null, 0, UNSUBMITTED, false, true ],
  ['never',     'button', null, 1, CORRECT,     false, false],
  ['never',     'auto',   null, 1, CORRECT,     false, false],
  ['attempted', 'button', null, 0, UNSUBMITTED, false, false],
  ['attempted', 'button', null, 1, INCORRECT,   true,  false],
  ['attempted', 'button', null, 1, CORRECT,     true,  false],
  ['attempted', 'auto',   null, 0, UNSUBMITTED, false, false],
  ['attempted', 'auto',   1,    1, INCORRECT,   false, true ],
  ['attempted', 'auto',   1,    1, CORRECT,     false, true ],
  ['attempted', undefined, null, 1, INCORRECT,  true,  false],
  ['correct',   'button', null, 1, INCORRECT,   false, false],
  ['correct',   'button', null, 1, CORRECT,     true,  false],
  ['correct',   'auto',   null, 1, CORRECT,     false, true ],
  ['closed',    'button', 1,    0, UNSUBMITTED, false, false],
  ['closed',    'button', 1,    1, INCORRECT,   true,  false],
  ['closed',    'button', null, 9, INCORRECT,   false, false],
  ['closed',    'auto',   1,    1, INCORRECT,   false, true ],
  ['finished',  'button', 2,    1, INCORRECT,   false, false],
  ['finished',  'button', 2,    1, CORRECT,     true,  false],
  ['finished',  'button', 2,    2, INCORRECT,   true,  false],
  ['finished',  'auto',   2,    1, CORRECT,     false, true ],
  [undefined,   'button', null, 0, UNSUBMITTED, false, false],
  [undefined,   'button', null, 1, INCORRECT,   true,  false],
  [undefined,   undefined, null, 1, INCORRECT,  true,  false],
  [undefined,   'auto',   null, 1, INCORRECT,   false, true ],
];

describe('answer visibility', () => {
  it.each(showAnswerRows.map((row, index) => [index, ...row] as const))(
    '[%i] showAnswer=%s answerReveal=%s maxAttempts=%s submitCount=%s correct=%s gives button=%s revealed=%s',
    (_index, showAnswer, answerReveal, maxAttempts, submitCount, correct, button, revealed) => {
      const problemState: ProblemState = { maxAttempts, submitCount, correct };
      expect(shouldShowAnswer(showAnswer, answerReveal, problemState)).toBe(button);
      expect(isAnswerAutoRevealed(showAnswer, answerReveal, problemState)).toBe(revealed);
    },
  );
});

// Input locking: the same conditions, read as "when does editing stop".
// 'attempted' and 'closed' coincide only when the problem has one attempt.
//
//             [ lockInput, maxAttempts, submitCount, correct, locked ]
type LockRow = [ProblemCondition | undefined, number | null, number, string, boolean];

const lockRows: LockRow[] = [
  [undefined,   1,    1, INCORRECT,   false],
  ['never',     1,    1, INCORRECT,   false],
  ['never',     null, 9, CORRECT,     false],
  ['always',    null, 0, UNSUBMITTED, true ],
  ['attempted', null, 0, UNSUBMITTED, false],
  ['attempted', null, 1, INCORRECT,   true ],
  ['attempted', 2,    1, INCORRECT,   true ],
  ['correct',   null, 1, INCORRECT,   false],
  ['correct',   null, 1, CORRECT,     true ],
  ['closed',    null, 0, UNSUBMITTED, false],
  ['closed',    null, 9, INCORRECT,   false],
  ['closed',    1,    0, UNSUBMITTED, false],
  ['closed',    1,    1, INCORRECT,   true ],
  ['closed',    2,    1, INCORRECT,   false],
  ['closed',    2,    2, INCORRECT,   true ],
  ['finished',  2,    1, INCORRECT,   false],
  ['finished',  2,    1, CORRECT,     true ],
  ['finished',  2,    2, INCORRECT,   true ],
];

describe('input locking', () => {
  it.each(lockRows.map((row, index) => [index, ...row] as const))(
    '[%i] lockInput=%s maxAttempts=%s submitCount=%s correct=%s gives locked=%s',
    (_index, lockInput, maxAttempts, submitCount, correct, locked) => {
      expect(isInputLocked(lockInput, { maxAttempts, submitCount, correct })).toBe(locked);
    },
  );
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
