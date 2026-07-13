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
import { fireEvent, waitFor, cleanup } from '@testing-library/react';
// Importing the harness also installs the jsdom shims + fetch mock.
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/componentLoader';
import { LO_FIELD_STRATEGY } from '@/lib/state/fieldTypes';

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


const mountProblem = (olx: string = OLX) =>
  mountOLXString(olx, { sourceName: 'grading-per-field' });

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

  it('when= expressions see derived problem-level correctness', async () => {
    // Regression: CapaProblem stopped storing its aggregate `correct`, but
    // DSL references (@problem.correct) read component buckets — they must
    // resolve through the derived-grading overlay (stateLanguage/hooks.ts).
    const BRANCHING_OLX = `<Vertical id="BranchDemo">
      <CapaProblem id="branch_problem" title="Geography">
        Capital of France?
        <KeyGrader>
          <ChoiceInput>
            <Key>Paris</Key>
            <Distractor>London</Distractor>
          </ChoiceInput>
        </KeyGrader>
      </CapaProblem>
      <Markdown id="followup" when="@branch_problem.correct === correctness.correct">
        BONUS_CONTENT_MARKER
      </Markdown>
    </Vertical>`;
    const { container, getByText } = await mountProblem(BRANCHING_OLX);

    expect(container.textContent).not.toContain('BONUS_CONTENT_MARKER');
    const radios = container.querySelectorAll('input[type="radio"]');
    fireEvent.click(radios[0]); // Paris
    await waitFor(() => expect(getByText(/Check|Submit/)).toBeTruthy());
    fireEvent.click(getByText(/Check|Submit/));
    await waitFor(() => expect(container.textContent).toContain('BONUS_CONTENT_MARKER'));
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
