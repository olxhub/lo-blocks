// @vitest-environment jsdom
// packages/shared/integration/duplicate-mount-inputs.test.tsx
//
// Radio `name` is a DOCUMENT-WIDE grouping key in HTML, but a block can be on
// screen more than once: a <Use> reference, or a Tabs panel that stays mounted
// (display:none) while another tab is active. When every copy derived its
// radio names from the block/StateKey, all copies landed in ONE browser radio
// group. React marks the selection checked in every copy; the browser then
// enforces one-checked-per-name and the last copy in the document wins — so
// the copy the learner was looking at silently UNCHECKED itself right after
// the click. Redux state stayed correct; only the visible mark vanished,
// which reads to a learner as "the app ate my answer".
//
// The fix gives each MOUNTED COPY its own useId()-derived DOM scope for
// `name` (and for id/htmlFor pairings) while state identity stays keyed by
// StateKey, so the copies still share one answer.
//
// These tests mount the same input twice through <Use> — two render
// instances, one StateKey — and assert the property that was broken: after a
// click, BOTH copies show checked.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, waitFor, cleanup } from '@testing-library/react';
import * as lo_event from 'lo_event';
// Importing the harness also installs the jsdom shims + fetch mock.
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

// lo_event delivers into whichever store was last store.init()'d, so a write
// still in flight when the next test mounts would land in THAT test's store.
// Drain before unmounting.
afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

/** Mount `olx` with a logEvent spy so tests can count dispatched writes. */
async function mountCounted(olx: string, sourceName: string) {
  const events: unknown[][] = [];
  const logEvent = (...args: unknown[]) => {
    events.push(args);
    return (lo_event.logEvent as any)(...args);
  };
  const mounted = await mountOLXString(olx, { sourceName, logEvent: logEvent as any });
  return { ...mounted, events };
}

const componentState = (reduxStore: any, stateKey: string) =>
  reduxStore.getState().application_state?.component?.[stateKey];

// ─── ChoiceInput (radio) ─────────────────────────────────────────────────────

// Block ids are per-test: lo_event/Redux state outlives a single mount here
// (the harness re-inits a store per mount but student state written under a
// StateKey carries over), so reusing one id would let an earlier test's answer
// bleed into the next.
const choiceOlx = (id: string) => `<Vertical id="DupChoice_${id}">
  <Hidden>
    <ChoiceInput id="colors_${id}">
      <Key value="red">Red</Key>
      <Distractor value="blue">Blue</Distractor>
    </ChoiceInput>
  </Hidden>
  <Use ref="colors_${id}" />
  <Use ref="colors_${id}" />
</Vertical>`;

describe('ChoiceInput mounted twice (<Use>)', () => {
  it('gives each mounted copy its own radio group name', async () => {
    const { container } = await mountCounted(choiceOlx('names'), 'dup-choice-names');
    const radios = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    );

    expect(radios).toHaveLength(4);
    // Within a copy, the two options share a name (that is what makes them
    // mutually exclusive); across copies the names differ.
    expect(radios[0].name).toBe(radios[1].name);
    expect(radios[2].name).toBe(radios[3].name);
    expect(radios[0].name).not.toBe(radios[2].name);
    // Names must not be bare state identity — that is the regression.
    expect(radios[0].name).not.toBe('CONTENT/colors_names');
  });

  it('checking in one copy shows checked in BOTH copies, and writes state once', async () => {
    const { container, reduxStore, events } = await mountCounted(choiceOlx('click'), 'dup-choice-click');
    const radios = () =>
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

    events.length = 0;
    fireEvent.click(radios()[0]); // "Red" in copy A

    // (a) both copies render the selection. Before the fix the browser's
    // one-checked-per-name rule unchecked copy A the moment copy B was
    // marked, leaving [false, false, true, false].
    await waitFor(() =>
      expect(radios().map(r => r.checked)).toEqual([true, false, true, false])
    );

    // (b) one shared answer, written once.
    expect(componentState(reduxStore, 'CONTENT/colors_click')?.value).toBe('red');
    expect(events).toHaveLength(1);
  });

  it('label text toggles the input inside its own copy', async () => {
    const { container } = await mountCounted(choiceOlx('label'), 'dup-choice-label');
    const radios = () =>
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

    // Each item's <label> wraps its own input, so clicking the label text in
    // copy B must activate copy B's input — not a same-named input elsewhere.
    const labelB = radios()[3].closest('label')!;
    expect(labelB.textContent).toContain('Blue');
    fireEvent.click(labelB.querySelector('.lo-choice-item__text')!);

    await waitFor(() =>
      expect(radios().map(r => r.checked)).toEqual([false, true, false, true])
    );
  });
});

// ─── TabularMCQ (radio mode) ─────────────────────────────────────────────────

// Content is flush-left on purpose: the block's body is parsed as YAML.
const tabularOlx = (id: string) => `<Vertical id="DupTabular_${id}">
  <Hidden>
<TabularMCQ id="tmcq_${id}" title="Ratings">
cols: Yes|y, No|n
rows: Alpha|a, Beta|b
</TabularMCQ>
  </Hidden>
  <Use ref="tmcq_${id}" />
  <Use ref="tmcq_${id}" />
</Vertical>`;

describe('TabularMCQ (radio) mounted twice (<Use>)', () => {
  it('names each row group per mounted copy, and keeps input ids unique', async () => {
    const { container } = await mountCounted(tabularOlx('names'), 'dup-tabular-names');
    const radios = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    );

    // 2 copies x 2 rows x 2 cols
    expect(radios).toHaveLength(8);

    // Row grouping still holds within a copy...
    expect(radios[0].name).toBe(radios[1].name); // copy A, row Alpha
    expect(radios[2].name).toBe(radios[3].name); // copy A, row Beta
    expect(radios[0].name).not.toBe(radios[2].name); // rows stay separate
    // ...and no name is shared across copies.
    expect(new Set(radios.map(r => r.name)).size).toBe(4);

    // htmlFor/id pairings must be unique too, or a label in one copy focuses
    // (and toggles) the identically-id'd input in the other.
    const ids = radios.map(r => r.id);
    expect(new Set(ids).size).toBe(8);
    for (const radio of radios) {
      const label = radio.closest('label')!;
      expect(label.getAttribute('for')).toBe(radio.id);
    }
  });

  it('checking a cell in one copy shows checked in BOTH copies, and writes state once', async () => {
    const { container, reduxStore, events } = await mountCounted(tabularOlx('click'), 'dup-tabular-click');
    const radios = () =>
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

    events.length = 0;
    fireEvent.click(radios()[0]); // copy A, row Alpha, col Yes

    await waitFor(() => expect(radios().map(r => r.checked)).toEqual([
      true, false, false, false, // copy A
      true, false, false, false, // copy B
    ]));
    expect(componentState(reduxStore, 'CONTENT/tmcq_click')?.value).toEqual({ a: 0 });
    expect(events).toHaveLength(1);
  });

  it('a label click activates the input in its own copy only', async () => {
    const { container } = await mountCounted(tabularOlx('label'), 'dup-tabular-label');
    const radios = () =>
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

    // Copy B, row Beta, col No — the last cell in the document.
    fireEvent.click(radios()[7].closest('label')!);

    await waitFor(() => expect(radios().map(r => r.checked)).toEqual([
      false, false, false, true,
      false, false, false, true,
    ]));
  });
});
