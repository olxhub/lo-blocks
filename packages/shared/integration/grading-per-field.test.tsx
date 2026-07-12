// @vitest-environment jsdom
// packages/shared/integration/grading-per-field.test.tsx
//
// End-to-end grading dispatch: mount a CapaProblem, submit an answer via the
// Check button, and assert that the grader writes its result as per-field
// CRDT events (correct, message, score, submitCount, lastSubmission each with
// their own conflict-resolution metadata) rather than the legacy compound
// UPDATE_CORRECT event. Guards the gather → evaluate → dispatch pipeline in
// lib/blocks/actions.tsx.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { Provider } from 'react-redux';
import { render as rtlRender, fireEvent, waitFor, cleanup } from '@testing-library/react';
import * as lo_event from 'lo_event';
import { parseOLX } from '@/lib/content/parseOLX';
import { toMemoryRef } from '@/lib/types/storage';
import { render, makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/componentLoader';
import { store } from '@/lib/state/store';
import { dispatchOlxJsonSync } from '@/lib/state/olxjson';
import { mockRuntime, TEST_NS } from '@/lib/test-utils';
import { getTextDirection } from '@/lib/i18n/getTextDirection';
import { toUserLocale } from '@/lib/types/i18n';
import { initConfig } from '@/lib/config';
import { LO_FIELD_STRATEGY } from '@/lib/state/fieldTypes';

initConfig('', ['client', 'test']);

// jsdom shim (same as demoRenderHarness)
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: false, media: '', onchange: null,
      addListener: () => { }, removeListener: () => { },
      addEventListener: () => { }, removeEventListener: () => { },
      dispatchEvent: () => false,
    }),
  });
}

const OLX = `<CapaProblem id="PerFieldGrading" title="Squares">
  What is 12 × 12?
  <NumericalGrader answer="144">
    <ComplexInput />
  </NumericalGrader>
</CapaProblem>`;

const IMMEDIATE_OLX = `<Vertical id="ImmediateDemo">
<CapaProblem id="ImmChoice" title="Planets" grade="immediate">
  <KeyGrader>
    Closest to the sun?
    <ChoiceInput>
      <Distractor>Venus</Distractor>
      <Key>Mercury</Key>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
<CapaProblem id="ImmNumeric" title="Squares" grade="immediate">
  <NumericalGrader answer="144">
    <ComplexInput />
  </NumericalGrader>
</CapaProblem>
</Vertical>`;


async function mountProblem(olx: string = OLX) {
  const { idMap, root } = await parseOLX(olx, [toMemoryRef('grading-per-field')], undefined, TEST_NS);
  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
  dispatchOlxJsonSync(reduxStore, 'content', idMap);
  const localeCode = toUserLocale('en-Latn-US');
  const runtime = mockRuntime({
    blockRegistry: BLOCK_REGISTRY,
    store: reduxStore,
    olxJsonSources: ['content'],
    locale: { code: localeCode, dir: getTextDirection(localeCode) },
    logEvent: lo_event.logEvent,   // real dispatch — the point of this test
    sideEffectFree: false,
  });
  const element = render({
    node: { type: 'block', id: root! },
    nodeInfo: makeRootNode(runtime),
    runtime,
  });
  const rendered = rtlRender(
    React.createElement(Provider, { store: reduxStore, children: element })
  );
  return { reduxStore, ...rendered };
}

// State keys are namespaced and parser-assigned (e.g.
// CONTENT/PerFieldGrading_grader_0) — resolve them from the store.
function componentKey(reduxStore: any, suffix: string) {
  const comp = reduxStore.getState().application_state?.component ?? {};
  return Object.keys(comp).find(k => k.endsWith(suffix));
}

function graderState(reduxStore: any) {
  const comp = reduxStore.getState().application_state?.component ?? {};
  const key = componentKey(reduxStore, '_grader_0');
  return (key && comp[key]) || {};
}

describe('grading dispatches per-field events', () => {
  beforeAll(async () => {
    await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
  }, 60_000);

  afterEach(() => cleanup());

  it('submitting writes each grader field with its own CRDT metadata', async () => {
    (window as any).__events?.clear();
    const { reduxStore, container, getByText } = await mountProblem();

    const input = container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
    expect(input).toBeTruthy();

    // lo_event dispatch is queued — wait for the typed value to fold into
    // the store before submitting, or the grader reads an empty input.
    const valueInStore = (v: string) => () => {
      const comp = reduxStore.getState().application_state?.component ?? {};
      const key = componentKey(reduxStore, '_input_0');
      expect(key && comp[key]?.value).toBe(v);
    };

    // Wrong answer first
    fireEvent.change(input, { target: { value: '100' } });
    await waitFor(valueInStore('100'));
    fireEvent.click(getByText(/Check/));
    await waitFor(() => expect(graderState(reduxStore).correct).toBe('incorrect'));

    let gs = graderState(reduxStore);
    expect(gs.submitCount).toBe(1);
    expect(gs.lastSubmission).toEqual(['100']);
    if (LO_FIELD_STRATEGY === 'crdt') {
      // Every grader field carries its own LWW metadata — the compound-event
      // era stamped only `correct`.
      for (const field of ['correct', 'submitCount', 'lastSubmission']) {
        expect(gs[`${field}.ts`], `${field}.ts`).toBeTypeOf('number');
        expect(gs[`${field}.actor`], `${field}.actor`).toBeTypeOf('string');
      }
    }

    // Right answer second
    fireEvent.change(input, { target: { value: '144' } });
    await waitFor(valueInStore('144'));
    fireEvent.click(getByText(/Check/));
    await waitFor(() => expect(graderState(reduxStore).correct).toBe('correct'));
    gs = graderState(reduxStore);
    expect(gs.submitCount).toBe(2);
    expect(gs.lastSubmission).toEqual(['144']);

    // CapaProblem's aggregate correctness is DERIVED from the child grader
    // (never stored) — the ✅ icon appearing proves the derived chain works.
    await waitFor(() => expect(container.textContent).toContain('✅'));
    expect(reduxStore.getState().application_state?.component?.[
      componentKey(reduxStore, 'PerFieldGrading')!]?.correct).toBeUndefined();

    // The wire format: one event per field, no compound UPDATE_CORRECT
    // (an UPDATE_CORRECT event may exist, but only carrying `correct` itself).
    const events = (window as any).__events?.getEvents() ?? [];
    const graderKey = componentKey(reduxStore, '_grader_0');
    const graderEvents = events.filter((e: any) => e.id === graderKey);
    expect(graderEvents.length).toBeGreaterThan(0);
    // No event carries more than one grader field — the old compound
    // UPDATE_CORRECT bundled all five.
    const graderFieldNames = ['correct', 'message', 'score', 'submitCount', 'lastSubmission'];
    for (const e of graderEvents) {
      const carried = graderFieldNames.filter(f => e[f] !== undefined);
      expect(carried.length, `compound event detected: ${JSON.stringify(e)}`)
        .toBeLessThanOrEqual(1);
    }
    const eventTypes = new Set(graderEvents.map((e: any) => e.event));
    for (const expected of ['UPDATE_CORRECT', 'UPDATE_MESSAGE', 'UPDATE_SCORE',
      'UPDATE_LAST_SUBMISSION', 'UPDATE_SUBMIT_COUNT']) {
      expect(eventTypes, `missing ${expected}`).toContain(expected);
    }
  });

  it('immediate mode derives correctness from live input values', async () => {
    const { reduxStore, container, queryByText } = await mountProblem(IMMEDIATE_OLX);

    // No Check/Submit button in immediate mode
    expect(queryByText(/Check|Submit/)).toBeNull();

    const problems = container.querySelectorAll('.lo-problem');
    expect(problems.length).toBe(2);
    const [choiceProblem, numericProblem] = Array.from(problems);

    // MCQ: radio commits on change — wrong choice grades incorrect instantly
    const radios = choiceProblem.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    fireEvent.click(radios[0]); // Venus (wrong)
    await waitFor(() => expect(choiceProblem.textContent).toContain('❌'));
    fireEvent.click(radios[1]); // Mercury (right)
    await waitFor(() => expect(choiceProblem.textContent).toContain('✅'));

    // Text input: mid-typing non-match softens to incomplete (⚠️), not ❌
    const input = numericProblem.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '14' } });
    await waitFor(() => expect(numericProblem.textContent).toContain('⚠️'));
    expect(numericProblem.textContent).not.toContain('❌');
    fireEvent.change(input, { target: { value: '144' } });
    await waitFor(() => expect(numericProblem.textContent).toContain('✅'));

    // Derived means derived: no grading state was stored for any grader in
    // the immediate problems. (The store is a singleton across tests, so
    // scope to this fixture's Imm* keys.)
    const comp = reduxStore.getState().application_state?.component ?? {};
    for (const [key, bucket] of Object.entries<any>(comp)) {
      if (key.includes('Imm') && key.includes('grader')) {
        expect(bucket.correct, `stored correctness on ${key}`).toBeUndefined();
      }
    }
  });
});
