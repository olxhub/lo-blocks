// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { testKey } from '@/lib/test-utils';
import { mountOLXString } from './demoRenderHarness';

const OLX = `<Tabs id="cursor_tabs">
  <Markdown id="tab_alpha" title="Alpha">Alpha panel body</Markdown>
  <Markdown id="tab_beta" title="Beta">Beta panel body</Markdown>
  <Markdown id="tab_gamma" title="Gamma">Gamma panel body</Markdown>
</Tabs>`;

const CONDITIONAL_OLX = `<Vertical id="conditional_tabs_test">
  <LineInput id="gate" />
  <ActionButton id="hide_first" label="Hide first tab">
    <SetFieldAction target="gate" field="value" value="hide" />
  </ActionButton>
  <Tabs id="conditional_tabs">
    <Markdown id="conditional_first" title="First" when="@gate.value !== 'hide'">First body</Markdown>
    <Markdown id="conditional_second" title="Second">Second body</Markdown>
    <Markdown id="conditional_third" title="Third">Third body</Markdown>
  </Tabs>
</Vertical>`;

const ACTION_OLX = `<Vertical id="action_tabs_test">
  <ActionButton id="select_beta" label="Select Beta">
    <SetFieldAction target="action_cursor_tabs" field="activeTab" value="tab_beta" />
  </ActionButton>
  <Tabs id="action_cursor_tabs">
    <Markdown id="tab_alpha" title="Alpha">Alpha panel body</Markdown>
    <Markdown id="tab_beta" title="Beta">Beta panel body</Markdown>
  </Tabs>
</Vertical>`;

function tabsState(store: any) {
  const components = store.getState().application_state?.component ?? {};
  const key = Object.keys(components).find(id => id.endsWith('cursor_tabs'));
  return key ? components[key] : {};
}

describe('Tabs active-child cursor', () => {
  beforeAll(async () => {
    await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
  }, 60_000);

  afterEach(cleanup);

  it('persists the initially visible child on first access', async () => {
    const { reduxStore } = await mountOLXString(OLX, { sourceName: 'tabs-cursor-untouched' });

    await waitFor(() => expect(tabsState(reduxStore).activeTab).toBe(testKey('tab_alpha')));
  });

  it('mounts only the active panel and persists its definition identity', async () => {
    const { container, getByText, queryByText, reduxStore } =
      await mountOLXString(OLX, { sourceName: 'tabs-cursor' });

    for (const title of ['Alpha', 'Beta', 'Gamma']) expect(getByText(title)).toBeTruthy();
    expect(queryByText(/Alpha panel body/)).toBeTruthy();
    expect(queryByText(/Beta panel body/)).toBeNull();

    fireEvent.click(getByText('Beta'));

    await waitFor(() => expect(queryByText(/Beta panel body/)).toBeTruthy());
    expect(queryByText(/Alpha panel body/)).toBeNull();
    expect(container.querySelector('[style*="display: none"]')).toBeNull();
    await waitFor(() => expect(tabsState(reduxStore).activeTab).toBe(testKey('tab_beta')));
  });

  it('stores a canonical child key when an action sets a bare ref', async () => {
    const { getByText, reduxStore } = await mountOLXString(
      ACTION_OLX,
      { sourceName: 'action-tabs-cursor' },
    );

    fireEvent.click(getByText('Select Beta'));

    await waitFor(() => expect(tabsState(reduxStore).activeTab).toBe(testKey('tab_beta')));
  });

  it('keeps the active identity when when= removes an earlier child', async () => {
    const { getByText, queryByText } = await mountOLXString(
      CONDITIONAL_OLX,
      { sourceName: 'conditional-tabs-cursor' },
    );

    fireEvent.click(getByText('Third'));
    await waitFor(() => expect(queryByText(/Third body/)).toBeTruthy());

    fireEvent.click(getByText('Hide first tab'));
    await waitFor(() => expect(queryByText('First')).toBeNull());
    expect(queryByText(/Third body/)).toBeTruthy();
    expect(queryByText(/Second body/)).toBeNull();
  });
});
