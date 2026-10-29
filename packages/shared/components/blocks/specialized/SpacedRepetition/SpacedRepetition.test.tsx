// @vitest-environment jsdom
// packages/shared/components/blocks/specialized/SpacedRepetition/SpacedRepetition.test.tsx
//
// Smoke test of the review loop: grades observed through a scoped child,
// recorded with the scheduler, and a fresh scope for every presentation.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { act, fireEvent, waitFor, cleanup } from '@testing-library/react';
// Importing the harness also installs the jsdom shims + fetch mock.
import { mountOLXString } from '@/integration/demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { updateField } from '@/lib/state';
import { fields } from './SpacedRepetition';

const card = (id: string, question: string, attrs = '') => `
<CapaProblem id="${id}" title="${question}"${attrs}>
${question}
<KeyGrader id="${id}_grader">
<ChoiceInput id="${id}_input">
  <Key id="${id}_yes">Yes</Key>
  <Distractor id="${id}_no">No</Distractor>
</ChoiceInput>
</KeyGrader>
</CapaProblem>`;

const deck = (kids: string, attrs = 'id="deck" baseInterval="1 day"') => `<SpacedRepetition ${attrs}>
${kids}
</SpacedRepetition>`;

const OLX = deck(card('spacing', 'Does spacing help?') + card('testing', 'Does testing help?'));

type View = Awaited<ReturnType<typeof mountOLXString>>;

const deckKey = ({ reduxStore }: View) =>
  Object.keys(reduxStore.getState().application_state.component).find(k => k.endsWith('/deck'))!;
const deckState = (view: View) => view.reduxStore.getState().application_state.component[deckKey(view)];

async function answer({ container, getByText }: View, choice: 0 | 1) {
  fireEvent.click(container.querySelectorAll('input[type="radio"]')[choice]);
  await waitFor(() => expect(getByText(/Check|Submit/)).toBeTruthy());
  fireEvent.click(getByText(/Check|Submit/));
  await waitFor(() => expect(getByText('Next card')).toBeTruthy());
}

describe('SpacedRepetition', () => {
  beforeAll(async () => {
    await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
  }, 60_000);

  afterEach(() => cleanup());

  it('schedules cards from observed grades and re-presents them blank', async () => {
    const view = await mountOLXString(OLX, { sourceName: 'spaced-repetition' });
    const { container, getByText } = view;

    await waitFor(() => expect(container.textContent).toContain('Does spacing help?'));
    expect(container.textContent).toContain('2 of 2 cards due');

    await answer(view, 0);
    expect(deckState(view).cards.spacing).toMatchObject({ reps: 1, state: { box: 2 } });
    fireEvent.click(getByText('Next card'));

    await waitFor(() => expect(container.textContent).toContain('Does testing help?'));
    await answer(view, 1);
    expect(deckState(view).cards.testing).toMatchObject({ reps: 1, state: { box: 1 } });
    expect(container.textContent).toContain('Not yet.');
    fireEvent.click(getByText('Next card'));

    await waitFor(() => expect(container.textContent).toContain('Nothing is due right now.'));
    expect(document.activeElement).toBe(getByText('Study ahead'));
    fireEvent.click(getByText('Study ahead'));

    // Box 1 comes back before box 2; its inputs start blank in a new scope.
    await waitFor(() => expect(container.textContent).toContain('Does testing help?'));
    const radios = [...container.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios.some(r => r.checked)).toBe(false);
    expect(deckState(view).current).toMatchObject({ cardKey: 'testing', rep: 2, result: null });
  });

  it('re-picks when the stored card is no longer in the deck', async () => {
    const view = await mountOLXString(OLX, { sourceName: 'spaced-repetition' });
    await waitFor(() => expect(view.container.textContent).toContain('cards due'));
    act(() => updateField(null, fields.current, { ...deckState(view).current, cardKey: 'removed' }, { stateKey: deckKey(view) }));
    await waitFor(() => expect(deckState(view).current.cardKey).not.toBe('removed'));
    expect(view.container.textContent).toContain('cards due');
  });

  it.each([
    ['a non-problem child', '<Markdown id="intro">Read this first.</Markdown>', 'intro'],
    ['a card with when=', card('hidden', 'Hidden?', ' when="false"'), 'hidden'],
    ['two cards with one id', '<Use ref="otherNs/spacing"/>', 'spacing'],
  ])('rejects %s', async (_label, extra, id) => {
    const { container } = await mountOLXString(deck(card('spacing', 'Does spacing help?') + extra));
    await waitFor(() => expect(container.querySelector('.lo-display-error')?.textContent).toContain(`"${id}"`));
  });

  it('wakes up for a card due past the setTimeout ceiling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const view = await mountOLXString(deck(card('spacing', 'Does spacing help?'), 'id="ceilingDeck" baseInterval="30 days"'));
      await waitFor(() => expect(view.container.textContent).toContain('1 of 1 card due'));
      await answer(view, 1);
      fireEvent.click(view.getByText('Next card'));
      await waitFor(() => expect(view.container.textContent).toContain('Nothing is due right now.'));
      for (const days of [25, 6]) await act(async () => { vi.advanceTimersByTime(days * 86_400_000); });
      await waitFor(() => expect(view.container.textContent).toContain('Does spacing help?'));
    } finally {
      vi.useRealTimers();
    }
  });
});
