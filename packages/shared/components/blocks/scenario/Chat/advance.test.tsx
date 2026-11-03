// @vitest-environment jsdom
// packages/shared/components/blocks/scenario/Chat/advance.test.tsx
//
// advance() — what one "Continue" click costs, and what it runs.
//
// Regression context. Three shipped courses end a chat with the same idiom:
//
//     Alma: that's the end of this part — tap Continue and it'll take you
//           straight to the meeting
//     --- pause ---
//     wj_course.selectedChild <- .../wj2b_sba_part1
//
// The walk stopped ON the pause, so that Continue revealed nothing and only
// the NEXT one reached the set command — one dead click in every one of the
// three places, which read to the author as "the tab switch isn't wired up".
//
// A pause separates COMMANDS that would otherwise run on a single click.
// Reached with nothing executed yet this walk, it has nothing to separate,
// so it costs no click. Reached after a set command or a section header has
// run, it still stops, which is the documented use.
//
// Driven through the mounted block (the Continue button calls advanceFrom,
// the same path as the spacebar) against a real store, so the assertions are
// on Redux field values rather than on internals.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, cleanup } from '@testing-library/react';
import { mountOLXString } from '@/integration/demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

/** A chat plus two sink blocks for set commands to write into. */
const chatOlx = (id: string, script: string) => `<Vertical id="${id}_wrap">
  <Chat id="${id}" title="Test"><![CDATA[
${script}
]]></Chat>
  <Hidden id="${id}_defs">
    <LineInput id="${id}_a" />
    <LineInput id="${id}_b" />
  </Hidden>
</Vertical>`;

type View = Awaited<ReturnType<typeof mountOLXString>>;

const continueButton = (view: View) =>
  Array.from(view.container.querySelectorAll('button'))
    .find(b => (b.textContent ?? '').includes('Continue')) ?? null;

async function clickContinue(view: View) {
  const button = continueButton(view);
  expect(button, 'expected a Continue button').not.toBeNull();
  expect(button!.disabled, 'expected Continue to be enabled').toBe(false);
  await act(async () => {
    fireEvent.click(button!);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

const componentState = (view: View, id: string) =>
  view.reduxStore.getState().application_state?.component?.[`CONTENT/${id}`];

/** The chat's `value` field — its pointer into the script body. */
const scriptIndex = (view: View, id: string) => componentState(view, id)?.value;
const sink = (view: View, id: string) => componentState(view, id)?.value;

describe('advance() and --- pause ---', () => {
  // The shipped idiom: closing line, pause, hand-off. ONE Continue.
  it('runs the command after a pause that follows a line, on one click', async () => {
    const id = 'pause_line_set';
    const view = await mountOLXString(chatOlx(id, [
      'Alma: that\'s the end of this part — tap Continue',
      '',
      '--- pause ---',
      '',
      `${id}_a.value <- handed_off`,
    ].join('\n')), { sourceName: 'chat-pause-line-set' });

    // Parked on the line; the set command has not run.
    expect(view.container.textContent).toContain('end of this part');
    expect(sink(view, `${id}_a`)).toBeUndefined();

    await clickContinue(view);

    expect(sink(view, `${id}_a`)).toBe('handed_off');
    // Walked to the end of the script: nothing left to Continue to.
    expect(scriptIndex(view, id)).toBe(2);
    expect(continueButton(view)).toBeNull();
  });

  // The documented use, unchanged: a pause BETWEEN two commands.
  it('still holds a command back when one has already run this click', async () => {
    const id = 'pause_set_set';
    const view = await mountOLXString(chatOlx(id, [
      'Alma: here we go',
      '',
      `${id}_a.value <- first`,
      '',
      '--- pause ---',
      '',
      `${id}_b.value <- second`,
    ].join('\n')), { sourceName: 'chat-pause-set-set' });

    await clickContinue(view);

    // First command ran; the pause stopped the walk before the second.
    expect(sink(view, `${id}_a`)).toBe('first');
    expect(sink(view, `${id}_b`)).toBeUndefined();
    expect(scriptIndex(view, id)).toBe(2); // parked on the pause

    await clickContinue(view);

    expect(sink(view, `${id}_b`)).toBe('second');
    expect(scriptIndex(view, id)).toBe(3);
  });

  // A pause is not a progressive reveal: it adds no click between lines.
  it('adds no click between two dialogue lines', async () => {
    const id = 'pause_line_line';
    const view = await mountOLXString(chatOlx(id, [
      'Alma: one',
      '',
      '--- pause ---',
      '',
      'Alma: two',
    ].join('\n')), { sourceName: 'chat-pause-line-line' });

    expect(view.container.textContent).toContain('one');
    expect(view.container.textContent).not.toContain('two');

    await clickContinue(view);

    expect(view.container.textContent).toContain('two');
    expect(scriptIndex(view, id)).toBe(2);
    expect(continueButton(view)).toBeNull();
  });

  // Decision: a trailing pause has nothing after it to hold back, so it is a
  // no-op. The chat is FINISHED at its last line — no Continue that would
  // reveal nothing, and (importantly) no disabled Continue either, which
  // would leave the student no way forward. advance() still steps over it
  // and returns false, so a parent's Next walks straight past.
  it('treats a trailing pause as a no-op: the chat finishes at its last line', async () => {
    const id = 'pause_trailing';
    const view = await mountOLXString(chatOlx(id, [
      'Alma: one',
      '',
      'Alma: two',
      '',
      '--- pause ---',
    ].join('\n')), { sourceName: 'chat-pause-trailing' });

    await clickContinue(view);

    expect(view.container.textContent).toContain('two');
    expect(continueButton(view)).toBeNull();

    // Same click count as the identical script without the trailing pause.
    const plain = await mountOLXString(chatOlx('pause_none', [
      'Alma: one',
      '',
      'Alma: two',
    ].join('\n')), { sourceName: 'chat-pause-none' });
    await clickContinue(plain);
    expect(continueButton(plain)).toBeNull();
  });
});
