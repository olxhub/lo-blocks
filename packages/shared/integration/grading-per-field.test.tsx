// @vitest-environment jsdom
// packages/shared/integration/grading-per-field.test.tsx
//
// TRANSITIONAL TEST — delete if it starts doing more harm than good.
//
// This mounts a particular authored exercise and drives it through learner UI
// controls. That makes it a useful smoke test today, but it is not the right
// long-term specification for grading: it couples action-pipeline behavior to
// NumericalGrader, ChoiceInput, button labels, icons, and DOM timing.
//
// The replacement design is deliberately declarative:
//
// 1. Each grader advertises author-level fixtures beside its implementation:
//    input(s) and expected normalized grading result(s), including edge cases
//    such as tolerances and syntax errors.
//    Something like:
//
//      grader({
//        grader: numericalGrade,
//        fixtures: [
//          { input: '4.01', expected: { correct: 'correct' } },
//          { input: '3.99', expected: { correct: 'correct' } },
//          { input: '4+bob', expected: { correct: 'invalid' } },
//        ],
//      })
//
// 2. A generic fixture runner executes every registered grader's fixtures.
//    Those real graders, rather than a hand-picked integration exercise, are
//    the conformance suite.
// 3. Action-pipeline tests stay action-oriented: start from inputs/events,
//    invoke the action, and assert the emitted per-field events and their
//    folded state — without depending on learner-facing UI elements.
//
// Until that exists, this test guards the gather → evaluate → dispatch path
// and the per-field CRDT event contract (correct, message, score, submitCount,
// and lastSubmission rather than the legacy compound UPDATE_CORRECT event).
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
<MarkupProblem id="ImmMarkup" title="Markup" grade="immediate"><![CDATA[
>>What is 12 x 12?<<
= 144
]]></MarkupProblem>
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

  it('grades unrendered problems from the static DOM (cross-page gating)', async () => {
    // Sequential unmounts non-current pages; content gating (and analytics/
    // server grading) must not depend on rendering. The gate on page 2
    // references a problem on page 1 — after answering on page 1 and
    // advancing (page 1 unmounts), the gate must still see the grade.
    const SEQ_OLX = `<Sequential id="SeqGate">
      <Vertical id="seq_page1" title="Question">
        <CapaProblem id="seq_problem" title="Geography">
          Capital of France?
          <KeyGrader>
            <ChoiceInput>
              <Key>Paris</Key>
              <Distractor>London</Distractor>
            </ChoiceInput>
          </KeyGrader>
        </CapaProblem>
      </Vertical>
      <Vertical id="seq_page2" title="Result">
        <Markdown id="seq_bonus" when="@seq_problem.correct === correctness.correct">
          GATED_CONTENT_MARKER
        </Markdown>
        <Markdown id="seq_filler">Always here.</Markdown>
      </Vertical>
    </Sequential>`;
    const { container, getByText } = await mountProblem(SEQ_OLX);

    // Page 1: answer correctly and submit
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBeGreaterThan(0);
    fireEvent.click(radios[0]); // Paris
    await waitFor(() => expect(getByText(/Check|Submit/)).toBeTruthy());
    fireEvent.click(getByText(/Check|Submit/));
    await waitFor(() => expect(container.textContent).toContain('✅'));

    // Advance to page 2 — page 1 (the problem) unmounts
    fireEvent.click(getByText(/Next/));
    await waitFor(() => expect(container.textContent).toContain('Always here.'));
    expect(container.querySelectorAll('input[type="radio"]').length).toBe(0);

    // The gate references the now-unrendered problem: static-DOM topology
    // aggregates its stored leaf state; dynamic-DOM topology saw nothing.
    await waitFor(() => expect(container.textContent).toContain('GATED_CONTENT_MARKER'));
  });

  it('RulesGrader matches rules wrapped in inline HTML (allowHTML descent)', async () => {
    // The StringMatch sits inside a <div> — an inline (html) kid. A static
    // scan that only looks at top-level block kids would skip it and fall
    // through to DefaultMatch (incorrect); recursive descent finds it.
    const RULES_HTML_OLX = `<CapaProblem id="RulesHtmlWrap" title="Derivative">
      <RulesGrader>
        <div><StringMatch answer="2x" score="1" feedback="Correct!"/></div>
        <DefaultMatch score="0" feedback="Nope"/>
        <LineInput/>
      </RulesGrader>
    </CapaProblem>`;
    const { reduxStore, container, getByText } = await mountProblem(RULES_HTML_OLX);
    // The singleton store persists keys across tests, so scope lookups to
    // this fixture's own namespaced keys (RulesHtmlWrap_*).
    const scopedKey = (suffix: string) => {
      const comp = reduxStore.getState().application_state?.component ?? {};
      return Object.keys(comp).find(k => k.includes('RulesHtmlWrap') && k.endsWith(suffix));
    };

    const input = container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '2x' } });
    await waitFor(() => {
      const comp = reduxStore.getState().application_state?.component ?? {};
      const key = scopedKey('_input_0');
      expect(key && comp[key]?.value).toBe('2x');
    });
    fireEvent.click(getByText(/Check/));
    await waitFor(() => {
      const comp = reduxStore.getState().application_state?.component ?? {};
      const key = scopedKey('_grader_0');
      expect(key && comp[key]?.correct).toBe('correct');
    });
  });

  it('immediate mode derives correctness from live input values', async () => {
    const { reduxStore, container, queryByText } = await mountProblem(IMMEDIATE_OLX);

    // No Check/Submit button in immediate mode
    expect(queryByText(/Check|Submit/)).toBeNull();

    const problems = container.querySelectorAll('.lo-problem');
    expect(problems.length).toBe(3);
    const [choiceProblem, numericProblem, markupProblem] = Array.from(problems);

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

    // MarkupProblem: generateProblemComponents stamps gradeMode onto its
    // generated graders (same convention as capaParser) — grade="immediate"
    // must grade live, no submit.
    const markupInput = markupProblem.querySelector('input') as HTMLInputElement;
    expect(markupInput).toBeTruthy();
    fireEvent.change(markupInput, { target: { value: '144' } });
    await waitFor(() => expect(markupProblem.textContent).toContain('✅'));

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
