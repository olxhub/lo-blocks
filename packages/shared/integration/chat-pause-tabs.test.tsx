// @vitest-environment jsdom
// packages/shared/integration/chat-pause-tabs.test.tsx
//
// The ending of a writing journal, end to end: a chat closes with a line,
// a `--- pause ---`, and a set command that moves the student to another
// tab. Authored exactly as the shipped journals author it.
//
//     X: last line
//     --- pause ---
//     t.activeTab <- 1
//
// Two things have to hold for that to work, and both have been broken:
//
//  1. The Continue after the closing line must RUN the set command. The walk
//     used to stop on the pause, so that click revealed nothing and the tab
//     only switched on a second click nobody knew to make (advance.test.tsx
//     covers the walk itself; this pins the whole pipeline).
//
//  2. "1" must arrive at Tabs as the NUMBER 1. Tabs' activeTab declares
//     z.coerce.number() and compares it to an index with ===; a set command
//     carries text, so coerceSetValue applies the destination field's schema.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, cleanup } from '@testing-library/react';
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { updateField } from '@/lib/state';
import { fields as chatFields } from '@/components/blocks/scenario/Chat/Chat';
import type { StateKey } from '@/lib/types';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

const OLX = `<Tabs id="cpt_tabs">
  <Vertical id="cpt_main" title="Main Content">
    <Chat id="cpt_chat" title="Journal"><![CDATA[
Alma: that's the end of this part — tap Continue and it'll take you straight to the meeting

--- pause ---

cpt_tabs.activeTab <- 1
]]></Chat>
  </Vertical>
  <Vertical id="cpt_meeting" title="The Meeting">
    <Markdown id="cpt_meeting_md">The Writers' Circle is here.</Markdown>
  </Vertical>
</Tabs>`;

describe('a chat that ends in a pause and a tab switch', () => {
  it('switches tabs on the Continue after the closing line', async () => {
    const view = await mountOLXString(OLX, { sourceName: 'chat-pause-tabs' });

    const panels = () => Array.from(
      view.container.querySelectorAll<HTMLElement>('.tab-panel'));
    const activeTabField = () => view.reduxStore.getState()
      .application_state?.component?.['CONTENT/cpt_tabs']?.activeTab;

    // Tab A is showing; the closing line is on screen; nothing has switched.
    expect(panels()).toHaveLength(2);
    expect(panels()[0].style.display).toBe('block');
    expect(panels()[1].style.display).toBe('none');
    expect(view.container.textContent).toContain('end of this part');
    expect(activeTabField()).toBeUndefined();

    const button = Array.from(view.container.querySelectorAll('button'))
      .find(b => (b.textContent ?? '').includes('Continue'));
    expect(button, 'expected the chat to offer a Continue').toBeTruthy();
    expect(button!.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(button!);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // ONE click: the set command ran, as a number, and tab B is showing.
    expect(activeTabField()).toBe(1);
    expect(typeof activeTabField()).toBe('number');
    expect(panels()[0].style.display).toBe('none');
    expect(panels()[1].style.display).toBe('block');
    expect(view.container.textContent).toContain("The Writers' Circle is here.");
  });
});

// ─── The journal's real shape ────────────────────────────────────────────────
//
// The plain Tabs > Chat above is a reduction. Writing Journal 3 wraps the same
// ending in a launchable <Cast>, four tabs, a SplitPanel with a UseHistory
// sidebar, and a chat that is windowed — `history=` names an opening section
// shown on arrival, `clip=` starts the live conversation at the next one — with
// a target embed and a wait before the closing beat. Each of those was a
// candidate for swallowing the closing set command: a scope the set command
// resolves differently from the Tabs block's own state key, or a clip window
// whose end lands on the pause rather than on the command after it.
//
// (Run against the shipped writing_journal3.olx verbatim as well, mounted
// through parseOLX with a FileStorageProvider over the course checkout: one
// Continue from the last line writes wj3_sba_tabs.activeTab = 3 and shows the
// Print & Submit panel. That run needs the sibling content repo, so what is
// pinned here is the faithful reduction.)

const SCRIPT = `
Earlier in the chat [id=cpw_opening]
------------------------------------

Lee: ok not to be dramatic but I have zero words

A Group Chat, Blowing Up [id=cpw_start]
---------------------------------------

Alma: what's YOUR take? it's on the right --->

::cpw_take [display=target:cpw_sidebar label="What's your take?"]

--- wait @cpw_take_input.value ---

Alma: that's exactly the kind of thinking this was for

Alma: that's the end of this part — tap Continue and it'll take you to the meeting

--- pause ---

cpw_tabs.activeTab <- 3
`;

const JOURNAL_OLX = `<Cast id="cpw_sba" title="Writing Journal" launchable="true">
  <Tabs id="cpw_tabs">
    <Vertical id="cpw_circle_tab" title="The Circle">
      <SplitPanel id="cpw_split" sizes="38, 62">
        <StartPane>
          <Chat id="cpw_chat" history="cpw_opening" clip="[cpw_start,]" height="460px"><![CDATA[
${SCRIPT}
]]></Chat>
        </StartPane>
        <EndPane>
          <Vertical id="cpw_current" title="Current Activity">
            <UseHistory id="cpw_sidebar" initial="cpw_welcome" />
          </Vertical>
        </EndPane>
      </SplitPanel>
    </Vertical>
    <Vertical id="cpw_journal_tab" title="My Journal"><Markdown id="cpw_journal_md">Your journal.</Markdown></Vertical>
    <Vertical id="cpw_people_tab" title="Characters"><Markdown id="cpw_people_md">The Circle.</Markdown></Vertical>
    <Vertical id="cpw_print_tab" title="Print and Submit"><Markdown id="cpw_print_md">Export your journal.</Markdown></Vertical>
  </Tabs>
  <Hidden id="cpw_defs">
    <Markdown id="cpw_welcome">How do you really feel about writing?</Markdown>
    <Vertical id="cpw_take"><LineInput id="cpw_take_input" /></Vertical>
  </Hidden>
</Cast>`;

describe('the journal ending, in the journal\'s own shape', () => {
  it('opens the fourth tab on the Continue after the closing line', async () => {
    const view = await mountOLXString(JOURNAL_OLX, { sourceName: 'chat-pause-wj-shape' });

    const panels = () => Array.from(
      view.container.querySelectorAll<HTMLElement>('.tab-panel'));
    const component = () => view.reduxStore.getState().application_state?.component ?? {};
    const advanceButton = () => Array.from(view.container.querySelectorAll('button'))
      .find(b => (b.textContent ?? '').includes('Continue'));
    const click = async (element: Element) => {
      await act(async () => {
        fireEvent.click(element);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    };

    // Walk until the wait blocks us (the sidebar activity is unanswered).
    let clicks = 0;
    while (advanceButton() && !advanceButton()!.disabled && clicks < 10) {
      await click(advanceButton()!);
      clicks++;
    }
    expect(advanceButton()?.disabled, 'expected the wait to hold the chat').toBe(true);

    // Answer it in the sidebar, exactly as the student does.
    const input = view.container.querySelector<HTMLInputElement>(
      '[data-block-id$="/cpw_take_input"] input, input[data-block-id$="/cpw_take_input"]')
      ?? view.container.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input, 'expected the embedded activity input').toBeTruthy();
    await act(async () => {
      fireEvent.change(input!, { target: { value: 'it is real' } });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // On until the closing line is on screen.
    const closing = 'tap Continue and it';
    clicks = 0;
    while (!(view.container.textContent ?? '').includes(closing) && clicks < 10) {
      expect(advanceButton()?.disabled, 'expected the chat to keep advancing').toBe(false);
      await click(advanceButton()!);
      clicks++;
    }
    expect(view.container.textContent).toContain(closing);
    expect(component()['CONTENT/cpw_tabs']?.activeTab).toBeUndefined();

    // ONE Continue from there — through the pause, into the set command.
    expect(advanceButton()?.disabled).toBe(false);
    await click(advanceButton()!);

    expect(component()['CONTENT/cpw_tabs']?.activeTab).toBe(3); // the 4th tab
    expect(panels()[0].style.display).toBe('none');
    expect(panels()[3].style.display).toBe('block');
    expect(view.container.textContent).toContain('Export your journal.');
    // Finished: the chat offers no further Continue.
    expect(advanceButton()).toBeUndefined();
  }, 30_000);
});

// ─── What a saved position at the end looks like ─────────────────────────────
//
// Reported from the browser as "the tab switch still isn't there": the chat
// showing its finished footer ("Observation mode") with no Continue, and the
// Tabs still on the first tab. That is what a chat whose SAVED index is
// already at the end of the clip looks like — a session that walked past the
// closing beat earlier (before this fix, that took two clicks and set the tab;
// clicking back to the first tab, or reloading, leaves exactly this state).
//
// A set command is a one-shot side effect of the walk: it runs when the
// student advances through it, and a chat with nowhere left to advance never
// runs it again. Pinned here so the symptom is read as stale student state
// rather than as a broken script — the recovery is to reset that student's
// state for the chat block, not to change the content.
describe('a chat whose saved position is already at the end', () => {
  it('shows the finished footer and does not re-run its closing command', async () => {
    // Its own ids: student state written under a StateKey outlives a mount.
    const view = await mountOLXString(
      OLX.replace(/cpt_/g, 'cpf_'), { sourceName: 'chat-pause-tabs-finished' });
    const component = () => view.reduxStore.getState().application_state?.component ?? {};

    await act(async () => {
      // Index 2 is the set command — the last entry, i.e. the end of the clip.
      updateField(null, chatFields.value, 2, { stateKey: 'CONTENT/cpf_chat' as StateKey });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(Array.from(view.container.querySelectorAll('button'))
      .find(b => (b.textContent ?? '').includes('Continue'))).toBeUndefined();
    expect(view.container.querySelectorAll('input[placeholder="Observation mode"]'))
      .toHaveLength(1);
    expect(component()['CONTENT/cpf_tabs']?.activeTab).toBeUndefined();
    expect(Array.from(view.container.querySelectorAll<HTMLElement>('.tab-panel'))
      .map(p => p.style.display)).toEqual(['block', 'none']);
  });
});
