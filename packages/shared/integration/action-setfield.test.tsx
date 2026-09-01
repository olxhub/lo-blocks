// @vitest-environment jsdom
// packages/shared/integration/action-setfield.test.tsx
//
// ActionButton → SetFieldAction through the full parse → Redux → render →
// click pipeline, in the shape a consent gate actually ships in: gating
// Verticals with when=, the target block parked in a <Hidden>, the button
// nested inside the gate.
//
// Regression context. A consent gate wrote value="acknowledged" onto a
// <Done> block, whose `value` field carries a boolean schema. updateField's
// `field.schema.parse()` threw — inside an async action, awaited by an
// onClick that ignored the returned promise. Net effect: an unhandled
// rejection somewhere off-screen, ZERO Redux dispatches, and a button that
// looked completely inert. These tests pin the working path and pin that a
// rejected action is reported rather than swallowed.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { act, fireEvent, cleanup } from '@testing-library/react';
import * as lo_event from 'lo_event';
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { ACTION_ERROR } from '@/lib/state/errorEvents';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

// Ids are per-test: student state written under a StateKey outlives a mount,
// so reusing ids would let one test's write bleed into the next.
const gateOlx = (id: string, flagTag: string, value: string) => `<Vertical id="sfa_study_${id}" launchable="true">
  <Vertical id="sfa_gate_${id}" when="!@sfa_flag_${id}.value">
    <ActionButton id="sfa_btn_${id}" label="Continue">
      <SetFieldAction id="sfa_set_${id}" target="sfa_flag_${id}" field="value" value="${value}" />
    </ActionButton>
  </Vertical>
  <Vertical id="sfa_after_${id}" when="@sfa_flag_${id}.value">
    <Markdown id="sfa_done_${id}">You are through.</Markdown>
  </Vertical>
  <Hidden id="sfa_defs_${id}">
    <${flagTag} id="sfa_flag_${id}" />
  </Hidden>
</Vertical>`;

async function clickContinue(view: { getByText: (t: string) => HTMLElement }) {
  await act(async () => {
    fireEvent.click(view.getByText('Continue'));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('ActionButton → SetFieldAction inside when= gates', () => {
  it('writes the target field and flips the gate', async () => {
    const view = await mountOLXString(
      gateOlx('ok', 'LineInput', 'acknowledged'), { sourceName: 'sfa-ok' });

    expect(view.container.textContent).toContain('Continue');
    expect(view.container.textContent).not.toContain('You are through.');

    await clickContinue(view);

    const componentState = view.reduxStore.getState()
      .application_state?.component?.['CONTENT/sfa_flag_ok'];
    expect(componentState?.value).toBe('acknowledged');
    expect(view.container.textContent).toContain('You are through.');
    expect(view.container.textContent).not.toContain('Continue');
  });

  // The failure mode that shipped: a value the target's field schema rejects.
  // The write must not happen (the value is genuinely invalid) — but the
  // click must not be a silent no-op either.
  it('reports a schema-invalid value instead of failing silently', async () => {
    const onError = vi.fn();
    // Spy at the EMISSION POINT the action uses — props.runtime.logEvent —
    // forwarding to the real logger so nothing else about the mount changes.
    const logEvent = vi.fn(lo_event.logEvent);
    // <Done>'s value is boolean; "acknowledged" is not a boolean.
    const view = await mountOLXString(
      gateOlx('bad', 'Done', 'acknowledged'), { sourceName: 'sfa-bad', logEvent });
    window.addEventListener('unhandledrejection', onError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await clickContinue(view);

    const componentState = view.reduxStore.getState()
      .application_state?.component?.['CONTENT/sfa_flag_bad'];
    expect(componentState?.value).toBeUndefined();
    expect(view.container.textContent).not.toContain('You are through.');

    // The failure surfaces on the console rather than vanishing into a
    // dropped promise.
    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('sfa_set_bad');
    consoleError.mockRestore();

    // ...and, more importantly, on the EVENT STREAM. The console reaches one
    // developer with DevTools open; the event reaches the server log, replay,
    // and per-user counts. A pilot has to be able to see this without asking
    // the student to open DevTools.
    const errorEvents = logEvent.mock.calls.filter(([type]) => type === ACTION_ERROR);
    expect(errorEvents).toHaveLength(1);
    const [, payload] = errorEvents[0];
    expect(payload.actionTag).toBe('SetFieldAction');
    // ids are namespaced DefinitionKeys ('CONTENT/sfa_set_bad'); stateKey
    // adds any instance scoping on top.
    expect(payload.actionId).toContain('sfa_set_bad');
    expect(payload.callerId).toContain('sfa_btn_bad');
    expect(payload.callerTag).toBe('ActionButton');
    expect(payload.actionStateKey).toContain('sfa_set_bad');
    expect(payload.error.name).toBeTruthy();
    expect(payload.error.message).toBeTruthy();
    // Lean by contract: the stack stays on the console, never on the wire,
    // and no `id` key (which the server's reducer would fold into state).
    expect(payload.error.stack).toBeUndefined();
    expect(payload.id).toBeUndefined();

    window.removeEventListener('unhandledrejection', onError);
  });
});
