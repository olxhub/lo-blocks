// packages/shared/lib/state/encode.test.ts
//
// The encode axis: aggregate events on the wire, per-sample expansion in
// replay, last-sample live reduce.

import { test, expect } from 'vitest';
import { expandEncodedEvents } from './encode';
import { lwwReduce } from '../crdt/lww';
import { replayToEvent } from '../replay';

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

test('replay mid-gesture: state at sample N is that sample, not the batch end', () => {
  // The look-forward property: the aggregate ARRIVES at its end time, but
  // replaying two steps in lands mid-gesture.
  const state = replayToEvent([AGG as any], 2);
  expect((state.component as any).vid.currentTime).toBe(45.25);
});
