// @vitest-environment jsdom
// packages/shared/integration/onshow-flash-chain.test.tsx
//
// A quiz authored newest-first: each item's when= watches the previous item's
// answer, and every revealed item carries <OnShow><Flash target="itself"/> so
// the learner sees where the new question landed. Reported from a browser:
// only the FIRST revealed item pulsed.
//
// Everything that could have made the second and later OnShows no-ops lives
// in JS, so it is testable here: `hasRun` is component state and could have
// been keyed per BLOCK TYPE rather than per instance (the first OnShow would
// then latch it for all of them); the Flash child has to be registered in the
// OLX dynamic DOM by the time the parent's mount effect calls
// executeNodeActions; and findVisibleBlock has to resolve the NEW item's
// wrapper rather than the previously flashed one. This test pins all three,
// for a chain long enough that a per-type latch or a first-match-wins
// registry lookup would show up.
//
// It also pins the other half of "once": an item already revealed before this
// mount must NOT pulse again on a reload — the flash marks arrival, and a
// remount is not an arrival.
//
// jsdom runs no CSS animations, so `lo-flash-active` is never taken off by
// animationend here; the test fires that event itself, the way the browser
// would, so each step starts from a clean slate.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { act, fireEvent, cleanup } from '@testing-library/react';
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

const ITEMS = 6;
const pad = (n: number) => String(n).padStart(2, '0');

beforeAll(async () => {
  // jsdom lays nothing out, so offsetParent is null everywhere and
  // findVisibleBlock would reject every candidate. Anything attached to the
  // document counts as visible.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? (this.parentElement ?? document.body) : null;
    },
  });
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
  vi.restoreAllMocks();
});

/** One quiz item; item 1 is ungated and carries no OnShow, as authored. */
const item = (n: number) => `
<Vertical id="fc_item_${pad(n)}"${n > 1 ? ` when="@fc_s${pad(n - 1)}.value"` : ''}>
${n > 1 ? `<OnShow id="fc_item_${pad(n)}_show"><Flash target="fc_item_${pad(n)}" /></OnShow>` : ''}
<Markdown id="fc_md_${pad(n)}">**Question ${n} of ${ITEMS}**</Markdown>
<ChoiceInput id="fc_s${pad(n)}">
  <Key value="agree">Agree</Key>
  <Key value="disagree">Disagree</Key>
</ChoiceInput>
</Vertical>`;

// Newest-first, exactly as the journal authors it: the newly revealed item is
// spliced in ABOVE the one just answered.
const OLX = `<Vertical id="fc_survey">
<Markdown id="fc_header">## The quiz</Markdown>
<Markdown id="fc_done" when="@fc_s${pad(ITEMS)}.value">That's all ${ITEMS}.</Markdown>
${Array.from({ length: ITEMS }, (_, i) => item(ITEMS - i)).join('\n')}
</Vertical>`;

const itemEl = (container: HTMLElement, n: number) =>
  container.querySelector<HTMLElement>(
    `[data-block-id$="/fc_item_${pad(n)}"][data-block-type="Vertical"]`);

const flashing = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.lo-flash-active'))
    .map(element => element.dataset.blockId);

/** Pick a choice in item `n`. */
async function answer(container: HTMLElement, n: number) {
  const element = itemEl(container, n);
  expect(element, `item ${pad(n)} is not mounted`).toBeTruthy();
  const radio = element!.querySelector<HTMLElement>('input[type="radio"]');
  expect(radio, `item ${pad(n)} has no radio`).toBeTruthy();
  await act(async () => {
    fireEvent.click(radio!);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** End every running flash, as the browser's animationend would. */
function endFlashes(container: HTMLElement) {
  for (const element of Array.from(container.querySelectorAll('.lo-flash-active'))) {
    act(() => { fireEvent.animationEnd(element); });
  }
}

describe('OnShow + Flash on each newly revealed quiz item', () => {
  it('flashes every item as it is revealed, not only the first', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { container } = await mountOLXString(OLX, { sourceName: 'onshow-flash-chain' });

    expect(itemEl(container, 1)).toBeTruthy();
    expect(itemEl(container, 2)).toBeNull();
    expect(flashing(container)).toEqual([]);

    for (let n = 1; n < ITEMS; n++) {
      await answer(container, n);
      const revealed = itemEl(container, n + 1);
      expect(revealed, `item ${pad(n + 1)} should be revealed`).toBeTruthy();
      // Exactly one thing pulses, and it is the item that just arrived.
      expect(flashing(container)).toEqual([revealed!.dataset.blockId]);
      endFlashes(container);
    }

    await answer(container, ITEMS);
    expect(container.textContent).toContain(`That's all ${ITEMS}.`);

    const flashWarnings = warn.mock.calls.filter(call => String(call[0]).startsWith('[Flash]'));
    expect(flashWarnings, `Flash warned: ${JSON.stringify(flashWarnings)}`).toHaveLength(0);
  }, 60_000);

  it('does not re-flash items the learner has already seen when the page reloads', async () => {
    const { container } = await mountOLXString(OLX, { sourceName: 'onshow-flash-reload' });
    for (let n = 1; n < 4; n++) {
      await answer(container, n);
      endFlashes(container);
    }

    // A reload restores the same Redux state into a fresh React tree; every
    // OnShow mounts again, with hasRun already true.
    cleanup();
    const reloaded = await mountOLXString(OLX, { sourceName: 'onshow-flash-reload' });
    expect(itemEl(reloaded.container, 4)).toBeTruthy();
    expect(flashing(reloaded.container)).toEqual([]);
  }, 60_000);
});
