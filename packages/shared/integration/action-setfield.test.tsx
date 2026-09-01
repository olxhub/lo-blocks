// @vitest-environment jsdom
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as lo_event from 'lo_event';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { ACTION_ERROR } from '@/lib/state/errorEvents';
import { mountOLXString } from './demoRenderHarness';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('action failures', () => {
  it('reports an invalid action and continues with independent siblings', async () => {
    // Preserve normal Redux folding while observing the emitted events.
    const logEvent = vi.fn(lo_event.logEvent);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = await mountOLXString(`<Vertical id="action_error_root" launchable="true">
      <ActionButton id="action_error_button" label="Run actions">
        <SetFieldAction id="action_error_bad" target="action_error_done" field="value" value="not-a-boolean" />
        <SetFieldAction id="action_error_good" target="action_error_text" field="value" value="continued" />
      </ActionButton>
      <Hidden>
        <Done id="action_error_done" />
        <LineInput id="action_error_text" />
      </Hidden>
    </Vertical>`, { sourceName: 'action-errors', logEvent });

    await act(async () => {
      fireEvent.click(view.getByText('Run actions'));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const state = view.reduxStore.getState().application_state.component;
    expect(state?.['CONTENT/action_error_done']?.value).toBeUndefined();
    expect(state?.['CONTENT/action_error_text']?.value).toBe('continued');

    const reports = logEvent.mock.calls.filter(([type]) => type === ACTION_ERROR);
    expect(reports).toHaveLength(1);
    expect(reports[0][1]).toMatchObject({
      actionTag: 'SetFieldAction',
      actionId: 'CONTENT/action_error_bad',
      callerTag: 'ActionButton',
      error: { title: 'ZodError' },
    });
    expect(reports[0][1].error.message).toBeTruthy();
    expect(reports[0][1].error.stack).toBeUndefined();
    expect(reports[0][1].id).toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});
