// packages/shared/lib/state/encode.test.ts
//
// The encode axis: aggregate events on the wire, per-sample expansion in
// replay, last-sample live reduce.

import { test, expect } from 'vitest';
import { expandEncodedEvents, expandAndOrderEvents } from './encode';
import { trace, debounce, lastValue, type SampleBuffer } from './encoders';
import { lwwReduce } from '../crdt/lww';
import { replayToEvent } from '../replay';

/** Run a write sequence [ts, value][] through an encoder; return payload. */
function encodeAll(encoder: ReturnType<typeof trace>, writes: [number, any][]) {
  let buffer: SampleBuffer | undefined;
  for (const [ts, value] of writes) buffer = encoder.append(buffer, value, ts);
  return encoder.flush(buffer!);
}

const AGG = {
  event: 'UPDATE_CURRENTTIME', scope: 'component', id: 'vid',
  field: 'currentTime', actor: 'test',
  startTs: 1000, endTs: 1750,
  samples: [[0, 45.0], [250, 45.25], [500, 45.5], [750, 45.75]] as [number, number][],
};

test('expandEncodedEvents: one aggregate → one event per sample, own timestamps', () => {
  const out = expandEncodedEvents([AGG]);
  expect(out).toHaveLength(4);
  expect(out[0].currentTime).toBe(45.0);
  expect(out[0].ts).toBe(1000);
  expect(out[3].currentTime).toBe(45.75);
  expect(out[3].ts).toBe(1750);
  expect(out[0].samples).toBeUndefined();
});

test('expandEncodedEvents passes ordinary events through untouched', () => {
  const plain = { event: 'UPDATE_VALUE', id: 'b', field: 'value', value: 'x', ts: 5 };
  expect(expandEncodedEvents([plain])).toEqual([plain]);
});

test('lwwReduce on an aggregate takes the last sample at its own time', () => {
  const patch = lwwReduce({}, AGG, 'currentTime');
  expect(patch.currentTime).toBe(45.75);
  expect(patch['currentTime.ts']).toBe(1750);
});

test('trace keeps every sample', () => {
  const out = encodeAll(trace(), [[1000, 1], [1100, 2], [1200, 3]]);
  expect(out.samples).toEqual([[0, 1], [100, 2], [200, 3]]);
  expect(out.startTs).toBe(1000);
  expect(out.endTs).toBe(1200);
});

test('debounce keeps first, last, and one per interval', () => {
  const out = encodeAll(debounce({ intervalMs: 500 }), [
    [1000, 'a'], [1100, 'b'], [1300, 'c'], [1600, 'd'], [1700, 'e'],
  ]);
  // first (0,'a') protected; (600,'d') opens a new interval; trailing 'e'
  // overwrites within-interval — the gesture's end survives.
  expect(out.samples).toEqual([[0, 'a'], [700, 'e']]);
});

test('lastValue keeps only the end of the gesture', () => {
  const out = encodeAll(lastValue(), [[1000, 1], [1250, 2], [1400, 3]]);
  expect(out.samples).toEqual([[400, 3]]);
});

test('expandAndOrderEvents interleaves samples with later events by TIME', () => {
  // The aggregate ARRIVES after the plain event but its samples belong
  // before it: time order must interleave them.
  const plain = { event: 'UPDATE_VALUE', id: 'b', field: 'value', value: 'x', ts: 1400 };
  const ordered = expandAndOrderEvents([plain, AGG]);
  expect(ordered.map((e: any) => e.ts)).toEqual([1000, 1250, 1400, 1500, 1750]);
  expect((ordered[2] as any).value).toBe('x');
});

test('replay mid-gesture: state at sample N is that sample, not the batch end', () => {
  // The look-forward property: the aggregate ARRIVES at its end time, but
  // replaying two steps in lands mid-gesture.
  const state = replayToEvent([AGG as any], 2);
  expect((state.component as any).vid.currentTime).toBe(45.25);
});
