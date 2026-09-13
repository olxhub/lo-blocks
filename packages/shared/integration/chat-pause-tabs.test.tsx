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
