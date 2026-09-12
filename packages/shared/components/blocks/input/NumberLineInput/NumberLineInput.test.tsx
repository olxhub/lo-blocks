// @vitest-environment jsdom
// packages/shared/components/blocks/input/NumberLineInput/NumberLineInput.test.tsx
//
// The properties that make a number line an INPUT rather than a picture:
// an unanswered line writes nothing, a drag writes a number, ticks decide
// what that number may be and what a screen reader says it is, and the lock
// (attribute, field, or grader/problem) actually stops the control.
//
// Mounted end to end through the OLX parser and renderer — a number line is
// its ticks, and ticks only exist after a parse.
//
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, cleanup, waitFor } from '@testing-library/react';
import * as lo_event from 'lo_event';
import { mountOLXString } from '@/integration/demoRenderHarness';
import { parseOLX } from '@/lib/content/parseOLX';
import { toMemoryRef } from '@/lib/types/storage';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { TEST_NS } from '@/lib/test-utils';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

// lo_event delivers into whichever store was last init'd; drain before the
// next mount so a write in flight can't land in the next test's store.
afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

const componentState = (reduxStore: any, stateKey: string) =>
  reduxStore.getState().application_state?.component?.[stateKey];

const rangeOf = (container: HTMLElement) =>
  container.querySelector('input[type="range"]') as HTMLInputElement;

/** Ids are per-test: student state written under a StateKey outlives the
 *  store a single mount created, so a shared id would bleed across tests. */
const line = (id: string, attrs: string, ticks = '') =>
  `<Vertical id="wrap_${id}"><NumberLineInput id="${id}" ${attrs}>${ticks}</NumberLineInput></Vertical>`;

/** Mount with a logEvent spy, so a test can count field writes (a write that
 *  changes nothing still costs an event, and "writes nothing extra" is the
 *  property under test). */
async function mountCounted(olx: string, sourceName: string) {
  const events: unknown[][] = [];
  const logEvent = (...args: unknown[]) => {
    events.push(args);
    return (lo_event.logEvent as any)(...args);
  };
  const mounted = await mountOLXString(olx, { sourceName, logEvent: logEvent as any });
  return { ...mounted, events };
}

const LIKERT_TICKS = `
  <Tick value="1">Strongly disagree</Tick>
  <Tick value="5">Strongly agree</Tick>`;

const FIVE_TICKS = `
  <Tick value="1">Strongly disagree</Tick>
  <Tick value="2">Disagree</Tick>
  <Tick value="3">Neutral</Tick>
  <Tick value="4">Agree</Tick>
  <Tick value="5">Strongly agree</Tick>`;

const UNEVEN_TICKS = `
  <Tick value="0">none</Tick>
  <Tick value="10">a little</Tick>
  <Tick value="50">half</Tick>
  <Tick value="100">all</Tick>`;

describe('NumberLineInput: the unanswered line', () => {
  it('rests at initial=, marks itself unset, and writes nothing', async () => {
    const { container, reduxStore } = await mountOLXString(
      line('nl_unset', 'min="0" max="100" step="1" initial="30"'), 'nl-unset');

    expect(rangeOf(container).value).toBe('30');
    expect(container.querySelector('.lo-numberline')?.getAttribute('data-unset')).toBe('true');
    expect(componentState(reduxStore, `${TEST_NS}/nl_unset`)?.value).toBeUndefined();
  });

  it('rests at the midpoint when no initial= is given', async () => {
    const { container } = await mountOLXString(
      line('nl_midpoint', 'min="0" max="10" step="1"'), 'nl-midpoint');

    expect(rangeOf(container).value).toBe('5');
  });
});

describe('NumberLineInput: writing a value', () => {
  it('writes the dragged number to the field and stops being unset', async () => {
    const { container, reduxStore } = await mountOLXString(
      line('nl_write', 'min="0" max="100" step="1"'), 'nl-write');

    fireEvent.change(rangeOf(container), { target: { value: '42' } });

    await waitFor(() =>
      expect(componentState(reduxStore, `${TEST_NS}/nl_write`)?.value).toBe(42));
    expect(container.querySelector('.lo-numberline')?.getAttribute('data-unset')).toBe('false');
  });

  it('commits the NEAREST tick when snap="ticks", however uneven the ticks', async () => {
    const { container, reduxStore } = await mountOLXString(
      line('nl_snap', 'min="0" max="100" step="1" snap="ticks"', UNEVEN_TICKS), 'nl-snap');

    fireEvent.change(rangeOf(container), { target: { value: '42' } });

    await waitFor(() =>
      expect(componentState(reduxStore, `${TEST_NS}/nl_snap`)?.value).toBe(50));
    // The thumb shows the committed tick, not where the pointer was let go.
    expect(rangeOf(container).value).toBe('50');
  });
});

describe('NumberLineInput: answering without moving the thumb', () => {
  // A learner who means "neutral" clicks the thumb where it already rests.
  // Nothing moves, so no change event fires — and without this path their
  // answer would stay null while the screen shows their choice.
  it('commits the resting position on pointer up while unset', async () => {
    const { container, reduxStore } = await mountCounted(
      line('nl_pointer', 'min="1" max="5" step="1" snap="ticks" initial="3"', FIVE_TICKS),
      'nl-pointer');

    expect(componentState(reduxStore, `${TEST_NS}/nl_pointer`)?.value).toBeUndefined();
    fireEvent.pointerUp(rangeOf(container));

    await waitFor(() =>
      expect(componentState(reduxStore, `${TEST_NS}/nl_pointer`)?.value).toBe(3));
    expect(container.querySelector('.lo-numberline')?.getAttribute('data-unset')).toBe('false');
  });

  it('commits on key up even when the key moved nothing (Home at min)', async () => {
    const { container, reduxStore } = await mountCounted(
      line('nl_keyup', 'min="0" max="10" step="1" initial="0"'), 'nl-keyup');

    fireEvent.keyUp(rangeOf(container), { key: 'Home' });

    await waitFor(() =>
      expect(componentState(reduxStore, `${TEST_NS}/nl_keyup`)?.value).toBe(0));
  });

  it('writes nothing extra once the line has a value', async () => {
    const { container, reduxStore, events } = await mountCounted(
      line('nl_already_set', 'min="0" max="100" step="1"'), 'nl-already-set');

    events.length = 0;
    fireEvent.change(rangeOf(container), { target: { value: '42' } });
    await waitFor(() =>
      expect(componentState(reduxStore, `${TEST_NS}/nl_already_set`)?.value).toBe(42));

    fireEvent.pointerUp(rangeOf(container));
    fireEvent.keyUp(rangeOf(container), { key: 'End' });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(componentState(reduxStore, `${TEST_NS}/nl_already_set`)?.value).toBe(42);
    expect(events).toHaveLength(1);
  });

  it('stays unanswered when the line is locked', async () => {
    const { container, reduxStore } = await mountCounted(
      line('nl_locked_touch', 'min="0" max="10" step="1" readonly="true"'), 'nl-locked-touch');

    fireEvent.pointerUp(rangeOf(container));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(componentState(reduxStore, `${TEST_NS}/nl_locked_touch`)?.value).toBeUndefined();
  });
});

describe('NumberLineInput: what a screen reader hears', () => {
  it('reports the tick\'s own words when the line snaps to ticks', async () => {
    const { container } = await mountOLXString(
      line('nl_valuetext', 'min="1" max="5" step="1" snap="ticks" initial="5"', LIKERT_TICKS),
      'nl-valuetext');

    expect(rangeOf(container).getAttribute('aria-valuetext')).toBe('Strongly agree');
  });

  it('reports the number when there are no ticks', async () => {
    const { container } = await mountOLXString(
      line('nl_valuetext_plain', 'min="0" max="100" step="1" initial="30"'), 'nl-valuetext-plain');

    expect(rangeOf(container).getAttribute('aria-valuetext')).toBe('30');
  });

  it('names the line from its endpoints when there is no title', async () => {
    const { container } = await mountOLXString(
      line('nl_label', 'min="1" max="5" step="1" snap="ticks"', LIKERT_TICKS), 'nl-label');

    expect(rangeOf(container).getAttribute('aria-label')).toBe('Strongly disagree – Strongly agree');
  });
});

describe('NumberLineInput: locks', () => {
  it('is disabled by the readonly attribute', async () => {
    const { container } = await mountOLXString(
      line('nl_ro_attr', 'min="0" max="10" step="1" readonly="true"'), 'nl-ro-attr');

    expect(rangeOf(container).disabled).toBe(true);
  });

  it('is disabled once the readonly FIELD is set at runtime', async () => {
    const { container } = await mountOLXString(
      `<Vertical id="wrap_nl_ro_field">
        <NumberLineInput id="nl_ro_field" min="0" max="10" step="1" />
        <ActionButton id="nl_ro_lock" label="Lock">
          <SetFieldAction id="nl_ro_set" target="nl_ro_field" field="readonly" value="true" />
        </ActionButton>
      </Vertical>`, 'nl-ro-field');

    expect(rangeOf(container).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(container.querySelector('button')!);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(rangeOf(container).disabled).toBe(true));
  });

  it('is disabled by the enclosing problem\'s lockInput (useInputReadOnly)', async () => {
    const { container } = await mountOLXString(
      `<CapaProblem id="nl_lock_problem" title="Locked" lockInput="always">
        <NumericalGrader id="nl_lock_grader" answer="5" tolerance="1">
          <NumberLineInput id="nl_lock_input" min="0" max="10" step="1" />
        </NumericalGrader>
      </CapaProblem>`, 'nl-lock-problem');

    expect(rangeOf(container).disabled).toBe(true);
  });
});

describe('NumberLineInput: expressions', () => {
  it('places the reference marker at the expression\'s position', async () => {
    const { container } = await mountOLXString(
      line('nl_reference', 'min="0" max="100" step="1" reference="25" referenceLabel="now"'),
      'nl-reference');

    const marker = container.querySelector('.lo-numberline__reference') as HTMLElement;
    expect(marker).toBeTruthy();
    expect(marker.style.getPropertyValue('inset-inline-start')).toBe('25%');
    expect(marker.textContent).toContain('now');
  });

  it('draws no marker without a reference=', async () => {
    const { container } = await mountOLXString(
      line('nl_no_reference', 'min="0" max="100" step="1"'), 'nl-no-reference');

    expect(container.querySelector('.lo-numberline__reference')).toBeNull();
  });

  it('reads initial= from another block\'s value', async () => {
    const { container, reduxStore } = await mountOLXString(
      `<Vertical id="wrap_nl_follow">
        <NumberLineInput id="nl_lead" min="0" max="100" step="1" />
        <NumberLineInput id="nl_follow" min="0" max="100" step="1" initial="@nl_lead.value" />
      </Vertical>`, 'nl-follow');

    const lines = container.querySelectorAll('input[type="range"]');
    fireEvent.change(lines[0], { target: { value: '80' } });

    await waitFor(() =>
      expect(componentState(reduxStore, `${TEST_NS}/nl_lead`)?.value).toBe(80));
    // The follower has no value of its own, so it rests where the lead is.
    await waitFor(() =>
      expect((container.querySelectorAll('input[type="range"]')[1] as HTMLInputElement).value)
        .toBe('80'));
  });

  it('positions each tick by its share of the range', async () => {
    const { container } = await mountOLXString(
      line('nl_tickpos', 'min="0" max="100" step="1"', UNEVEN_TICKS), 'nl-tickpos');

    const positions = Array.from(container.querySelectorAll('.lo-numberline-tick'))
      .map(el => (el as HTMLElement).style.getPropertyValue('inset-inline-start'));
    expect(positions).toEqual(['0%', '10%', '50%', '100%']);
  });

  // A tick centred on its position hangs half its label off the end of the
  // line, where the enclosing panel clips it. The endpoints say so, and the
  // stylesheet anchors them inward; everything between stays centred.
  it('flags the ticks at min and max so their labels can anchor inward', async () => {
    const { container } = await mountOLXString(
      line('nl_edges', 'min="0" max="100" step="1"', UNEVEN_TICKS), 'nl-edges');

    const edges = Array.from(container.querySelectorAll('.lo-numberline-tick'))
      .map(el => el.getAttribute('data-edge'));
    expect(edges).toEqual(['start', null, null, 'end']);
  });
});

describe('NumberLineInput: parse-time errors', () => {
  const parse = (olx: string, name: string) =>
    parseOLX(olx, [toMemoryRef(name)], undefined, TEST_NS);

  it('rejects a tick outside the line\'s range', async () => {
    const { errors } = await parse(
      line('nl_bad_range', 'min="0" max="10" step="1"', '<Tick value="50">too far</Tick>'),
      'nl-bad-range');

    expect(errors.map(e => e.message).join('\n')).toMatch(/outside the line's range/);
  });

  it('rejects two ticks at the same position', async () => {
    const { errors } = await parse(
      line('nl_dup_ticks', 'min="0" max="10" step="1"',
        '<Tick value="5">five</Tick><Tick value="5">also five</Tick>'),
      'nl-dup-ticks');

    expect(errors.map(e => e.message).join('\n')).toMatch(/share the same value/);
  });

  it('rejects step="0" (a continuum is a small step, not no step)', async () => {
    const { errors } = await parse(
      line('nl_zero_step', 'min="0" max="10" step="0"'), 'nl-zero-step');

    expect(errors.map(e => e.message).join('\n')).toMatch(/step must be greater than 0/);
  });

  it('rejects a range that does not go anywhere', async () => {
    const { errors } = await parse(
      line('nl_bad_span', 'min="10" max="10" step="1"'), 'nl-bad-span');

    expect(errors.map(e => e.message).join('\n')).toMatch(/must be less than max/);
  });
});
