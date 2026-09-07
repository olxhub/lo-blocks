// @vitest-environment jsdom
// packages/shared/integration/one-submission-item.test.tsx
//
// The one-submission item, rendered: answerReveal="auto" reveals the key with
// the result and never offers a button, and lockInput freezes the inputs so
// what is on screen is what was scored.
//
// Both behaviours are DERIVED (lib/player/useEnclosingProblem.ts) from the
// problem's attributes plus its live submitCount — nothing is written on
// submit to make them happen — so this test drives the real UI rather than
// poking state: mount, choose, submit, look at the DOM.
//
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { fireEvent, waitFor, cleanup } from '@testing-library/react';
// Importing the harness also installs the jsdom shims + fetch mock.
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

// A one-grader MCQ carrying the row's problem attributes. Distractor first,
// Key second, so `pick` indexes the radios directly.
const RADIO_INDEX = { distractor: 0, key: 1 } as const;

function problemOLX(
  id: string, maxAttempts: string, spelling: string, showAnswer: string,
  answerReveal: string, lockInput: string,
): string {
  return `<CapaProblem id="${id}" title="Planets" maxAttempts="${maxAttempts}" ${spelling}="${showAnswer}" answerReveal="${answerReveal}" lockInput="${lockInput}">
Closest to the sun?
<KeyGrader>
<ChoiceInput>
<Distractor>Venus</Distractor>
<Key>Mercury</Key>
</ChoiceInput>
</KeyGrader>
</CapaProblem>`;
}

// One row per authored configuration and learner path, with everything the
// learner can see afterwards.
//
// `spelling` is the attribute name the row authors: the current `showAnswer`,
// or the deprecated lowercase `showanswer`, which the parse pipeline rewrites
// onto it (normalizeDeprecatedAttributes) and which must therefore behave
// identically.
//
//   [ label, maxAttempts, spelling, showAnswer, answerReveal, lockInput, pick,
//     submitted, key painted, radios disabled, Show Answer button, attempts text ]
type Row = [
  string, string, string, string, string, string, keyof typeof RADIO_INDEX, boolean,
  boolean, boolean, boolean, string | null,
];

const rows: Row[] = [
  ['assessment item, unsubmitted', '1', 'showAnswer', 'attempted', 'auto',   'closed',    'key',        false, false, false, false, null            ],
  ['assessment item, correct',     '1', 'showAnswer', 'attempted', 'auto',   'closed',    'key',        true,  true,  true,  false, null            ],
  ['assessment item, incorrect',   '1', 'showAnswer', 'attempted', 'auto',   'closed',    'distractor', true,  true,  true,  false, null            ],
  ['button reveal, submitted',     '1', 'showAnswer', 'attempted', 'button', 'never',     'key',        true,  false, false, true,  null            ],
  ['unlimited, locks on attempt',  '',  'showAnswer', 'attempted', 'auto',   'attempted', 'key',        true,  true,  true,  false, null            ],
  ['two attempts, one used',       '2', 'showAnswer', 'attempted', 'auto',   'closed',    'distractor', true,  true,  false, false, 'Final attempt' ],
  ['reveal only once correct',     '2', 'showAnswer', 'correct',   'auto',   'never',     'distractor', true,  false, false, false, 'Final attempt' ],
  ['deprecated spelling, revealed','1', 'showanswer', 'attempted', 'auto',   'closed',    'key',        true,  true,  true,  false, null            ],
  ['deprecated spelling, button',  '1', 'showanswer', 'attempted', 'button', 'never',     'key',        true,  false, false, true,  null            ],
];

describe('one-submission item', () => {
  beforeAll(async () => {
    await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
  }, 60_000);

  afterEach(() => cleanup());

  it.each(rows.map((row, index) => [index, ...row] as const))(
    '[%i] %s: maxAttempts=%s %s=%s answerReveal=%s lockInput=%s picking the %s, submitted=%s paints the key=%s, disables the inputs=%s, offers Show Answer=%s, attempts text=%s',
    async (
      index, _label, maxAttempts, spelling, showAnswer, answerReveal, lockInput, pick,
      submitted, keyPainted, disabled, showAnswerButton, attemptsText,
    ) => {
      // The Redux store is a singleton across tests; each row needs its own ids.
      const olx = problemOLX(
        `one_submission_${index}`, maxAttempts, spelling, showAnswer, answerReveal, lockInput,
      );
      const { container, getByText, queryByText } = await mountOLXString(
        olx, { sourceName: 'one-submission-item' },
      );

      const radios = () => Array.from(
        container.querySelectorAll('input[type="radio"]')
      ) as HTMLInputElement[];
      expect(radios().length).toBe(2);

      // lo_event dispatch is queued — wait for the choice to fold into the
      // store before submitting, or the grader reads an empty input.
      fireEvent.click(radios()[RADIO_INDEX[pick]]);
      await waitFor(() => expect(radios()[RADIO_INDEX[pick]].checked).toBe(true));

      if (submitted) {
        fireEvent.click(getByText(/Check|Submit/));
        await waitFor(() => expect(container.textContent).toMatch(/✅|❌/));
      }

      expect(container.querySelector('.lo-choiceinput-show-answer') !== null)
        .toBe(keyPainted);
      expect(radios().map(radio => radio.disabled)).toEqual([disabled, disabled]);
      expect(queryByText('Show Answer') !== null).toBe(showAnswerButton);

      const attempts = container.querySelector('.lo-capafooter__attempts');
      expect(attempts === null ? null : attempts.textContent).toBe(attemptsText);
    },
  );
});
