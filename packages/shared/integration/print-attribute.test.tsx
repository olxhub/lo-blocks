// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { mountOLXString } from './demoRenderHarness';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(cleanup);

const tabs = (print: string) => `<Tabs id="print_tabs" print="${print}">
  <Vertical id="first" title="One"><Html>panel one</Html></Vertical>
  <Vertical id="second" title="Two"><Html>panel two</Html></Vertical>
</Tabs>`;

describe('Tabs print modes', () => {
  it('no-chrome hides the header, while false hides the entire block', async () => {
    const noChrome = await mountOLXString(tabs('no-chrome'));
    expect(noChrome.container.querySelector('.tabs-header')?.classList.contains('print-hide')).toBe(true);
    expect(noChrome.container.querySelector('.lo-tag-tabs')?.classList.contains('print-hide')).toBe(false);
    cleanup();

    const hidden = await mountOLXString(tabs('false'));
    expect(hidden.container.querySelector('.lo-tag-tabs')?.classList.contains('print-hide')).toBe(true);
    expect(hidden.container.querySelector('.tabs-header')?.classList.contains('print-hide')).toBe(false);
  });
});
