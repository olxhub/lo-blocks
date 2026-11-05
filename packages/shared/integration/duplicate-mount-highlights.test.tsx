// @vitest-environment jsdom
// packages/shared/integration/duplicate-mount-highlights.test.tsx
//
// CSS.highlights is a DOCUMENT-WIDE registry keyed by name, and each entry's
// Ranges point into one specific copy of the passage DOM. An <Annotate> can be
// on screen more than once -- a <Use> of it, a Tabs panel that stays mounted
// (display:none) while another tab is active, an activity pane showing the same
// screen. Every copy runs useHighlights, so a name derived from the block id
// makes the copies overwrite one another: the last effect in tree order wins
// and every other copy paints nothing, while its note cards still render from
// shared state.
//
// These tests mount one Annotate twice through <Use>, create an annotation in
// the first copy, and assert the property that was broken: BOTH copies hold a
// live registry entry whose Range spans their own passage text.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

// jsdom has neither CSS.highlights nor Highlight. A Map and a Range-collecting
// class are the whole contract useHighlights depends on.
class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) { this.ranges = ranges; }
}

const ZERO_RECT = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };

beforeAll(async () => {
  (globalThis as any).CSS = { ...(globalThis as any).CSS, highlights: new Map() };
  (window as any).Highlight = FakeHighlight;
  // jsdom does no layout, so Range has no getBoundingClientRect. The popup
  // only needs somewhere to sit; the offsets under test come from text length.
  (Range.prototype as any).getBoundingClientRect = () => ZERO_RECT;
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

const registry = () => (globalThis as any).CSS.highlights as Map<string, FakeHighlight>;

const PASSAGE = 'First selected text last';

const annotateOlx = (id: string) => `<Vertical id="DupAnn_${id}">
  <Hidden>
    <Annotate id="ann_${id}">
      <Markdown id="ann_${id}_md">${PASSAGE}</Markdown>
    </Annotate>
  </Hidden>
  <Use ref="ann_${id}" />
  <Use ref="ann_${id}" />
</Vertical>`;

/** Select `text` inside `passage` and save it through the popup's button. */
async function annotate(container: HTMLElement, passage: Element, text: string) {
  const walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  while (walker.nextNode()) {
    const candidate = walker.currentNode as Text;
    if (candidate.data.includes(text)) { node = candidate; break; }
  }
  expect(node, `no text node containing "${text}"`).not.toBeNull();

  const range = document.createRange();
  range.setStart(node!, node!.data.indexOf(text));
  range.setEnd(node!, node!.data.indexOf(text) + text.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  fireEvent.mouseUp(passage);
  // handleMouseUp defers 10ms so the browser can finalize the selection.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

  const button = await waitFor(() => {
    const found = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Annotate'));
    expect(found).toBeTruthy();
    return found!;
  });
  fireEvent.click(button);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

describe('Annotate mounted twice (<Use>)', () => {
  it('registers a highlight for EVERY mounted copy, each over its own passage', async () => {
    const { container } = await mountOLXString(annotateOlx('paint'), 'dup-ann-paint');
    const passages = Array.from(container.querySelectorAll('.passage'));
    expect(passages).toHaveLength(2);

    registry().clear();
    await annotate(container, passages[0], 'selected text');

    // One entry per copy: a shared name means one entry, so the copy the
    // learner is looking at silently paints nothing.
    expect(registry().size).toBe(2);

    // Every entry's Range must land in the copy that registered it.
    const covered = passages.map(passage =>
      Array.from(registry().values()).some(highlight =>
        highlight.ranges.some(range =>
          passage.contains(range.startContainer) && range.toString() === 'selected text'
        )
      )
    );
    expect(covered).toEqual([true, true]);
  });
});

// The shape the course actually uses: the passage is on its own tab AND in an
// activity pane (a UseHistory inside a SplitPanel) on another tab. Tabs keeps
// every panel mounted behind display:none, so both copies run their effects on
// every annotation write -- the pane's copy first, the tab's copy last.
const topologyOlx = `<Vertical id="TopoRoot">
  <Hidden>
    <Annotate id="topo_ann">
      <Markdown id="topo_md">${PASSAGE}</Markdown>
    </Annotate>
  </Hidden>
  <Tabs id="topo_tabs">
    <Vertical id="topo_tab_pane" title="Pane">
      <SplitPanel id="topo_split" sizes="40,60">
        <StartPane><Markdown id="topo_chat">chat</Markdown></StartPane>
        <EndPane><UseHistory id="topo_hist" initial="topo_ann" /></EndPane>
      </SplitPanel>
    </Vertical>
    <Vertical id="topo_tab_book" title="Book">
      <Use ref="topo_ann" />
    </Vertical>
  </Tabs>
</Vertical>`;

describe('Annotate in an activity pane and on a tab', () => {
  it('paints in the pane the learner selected in, not only in the hidden tab', async () => {
    const { container } = await mountOLXString(topologyOlx, 'topo-ann');
    const passages = Array.from(container.querySelectorAll('.passage'));
    expect(passages).toHaveLength(2);
    const pane = passages[0];

    registry().clear();
    await annotate(container, pane, 'selected text');

    const paneRanges = Array.from(registry().values())
      .flatMap(highlight => highlight.ranges)
      .filter(range => pane.contains(range.startContainer));
    expect(paneRanges.map(range => range.toString())).toEqual(['selected text']);
  });
});
