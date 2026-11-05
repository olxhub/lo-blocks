// @vitest-environment jsdom
// packages/shared/integration/print-attribute.test.tsx
//
// Render-level behaviour of the `print` attribute.
//
//   print="false"      → render.tsx stamps `.print-hide` on the block wrapper
//                        (styles/print.css hides it inside @media print)
//   print="no-chrome"  → Tabs-only extension: the wrapper is NOT hidden, but
//                        the tab header strip carries `.print-hide`, so the
//                        active panel prints as a plain page.
//
// Everything here is CSS-time: the DOM is identical on screen, only class
// names differ. Nothing is conditionally unmounted.
//
// Importing the harness installs the jsdom shims and fetch mock (side effects).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { Provider } from 'react-redux';
import { render as rtlRender, cleanup, act } from '@testing-library/react';
import { parseOLX } from '@/lib/content/parseOLX';
import { toMemoryRef } from '@/lib/types/storage';
import { render, makeRootNode } from '@/lib/player/client/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { store } from '@/lib/state/store';
import { dispatchOlxJsonSync } from '@/lib/state/olxjson';
import { getTextDirection } from '@/lib/i18n/getTextDirection';
import { mockRuntime, TEST_NS } from '@/lib/test-utils';
import '@/integration/demoRenderHarness';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(() => cleanup());

async function mountOlx(olx: string) {
  const parsed = await parseOLX(olx, [toMemoryRef('/virtual/print-attribute.olx')], undefined, TEST_NS);
  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
  dispatchOlxJsonSync(reduxStore, 'content', parsed.idMap);
  const localeCode = 'en-Latn-US';
  const runtime = mockRuntime({
    blockRegistry: BLOCK_REGISTRY,
    store: reduxStore,
    olxJsonSources: ['content'],
    locale: { code: localeCode, dir: getTextDirection(localeCode) },
  });
  const element = render({
    node: { type: 'block', definitionKey: parsed.root },
    nodeInfo: makeRootNode(runtime),
    runtime,
  });
  let result: ReturnType<typeof rtlRender>;
  await act(async () => {
    result = rtlRender(React.createElement(Provider, { store: reduxStore }, element));
  });
  return result!;
}

const tabs = (printAttr: string) => `
<Vertical id="print_root">
  <Tabs id="print_tabs"${printAttr}>
    <Vertical id="print_tab_one" title="One"><Html>panel one</Html></Vertical>
    <Vertical id="print_tab_two" title="Two"><Html>panel two</Html></Vertical>
  </Tabs>
</Vertical>`;

describe('print="false" (base behaviour, unchanged)', () => {
  it('stamps print-hide on the block wrapper', async () => {
    const { container } = await mountOlx(`
<Vertical id="print_root">
  <Vertical id="print_hidden" print="false"><Html>screen only</Html></Vertical>
  <Vertical id="print_shown"><Html>always</Html></Vertical>
</Vertical>`);
    const hidden = container.querySelector('[data-block-id$="print_hidden"], .lo-tag-vertical.print-hide');
    expect(container.querySelectorAll('.print-hide').length).toBe(1);
    expect(hidden).toBeTruthy();
  });

  it('print="true" and an unset print add no class', async () => {
    const { container } = await mountOlx(`
<Vertical id="print_root">
  <Vertical id="print_yes" print="true"><Html>printed</Html></Vertical>
  <Vertical id="print_default"><Html>printed too</Html></Vertical>
</Vertical>`);
    expect(container.querySelectorAll('.print-hide').length).toBe(0);
  });
});

describe('Tabs print="no-chrome"', () => {
  it('hides only the tab header strip, not the block', async () => {
    const { container } = await mountOlx(tabs(' print="no-chrome"'));
    const header = container.querySelector('.tabs-header');
    expect(header).toBeTruthy();
    expect(header!.classList.contains('print-hide')).toBe(true);
    // The Tabs wrapper itself must stay printable.
    expect(container.querySelector('.lo-tag-tabs')!.classList.contains('print-hide')).toBe(false);
    // Panels are all mounted; the active one is the visible/printable one.
    const panels = container.querySelectorAll('.tab-panel');
    expect(panels.length).toBe(2);
    expect((panels[0] as HTMLElement).style.display).toBe('block');
    expect((panels[1] as HTMLElement).style.display).toBe('none');
  });

  it('without the attribute the header strip prints', async () => {
    const { container } = await mountOlx(tabs(''));
    expect(container.querySelector('.tabs-header')!.classList.contains('print-hide')).toBe(false);
    expect(container.querySelectorAll('.print-hide').length).toBe(0);
  });

  it('print="false" on Tabs still hides the whole block', async () => {
    const { container } = await mountOlx(tabs(' print="false"'));
    expect(container.querySelector('.lo-tag-tabs')!.classList.contains('print-hide')).toBe(true);
    expect(container.querySelector('.tabs-header')!.classList.contains('print-hide')).toBe(false);
  });
});
