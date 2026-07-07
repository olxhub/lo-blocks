// packages/shared/lib/state/adoptFieldState.test.ts
//
// ADOPT_FIELD_STATE reducer semantics (fields-design step 2b): server
// state riding a content fetch fills buckets this session never touched;
// locally-present buckets always win.

import { test, expect } from 'vitest';
import { updateResponseReducer, ADOPT_FIELD_STATE } from './store';

const adopt = (state: any, fieldState: any) =>
  updateResponseReducer(state, { event: ADOPT_FIELD_STATE, fieldState });

test('absent buckets are adopted', () => {
  const next = adopt(
    { component: {} },
    { component: { b1: { value: 'saved' } } },
  );
  expect(next.component.b1.value).toBe('saved');
});

test('locally-present buckets win over the server copy', () => {
  const next = adopt(
    { component: { b1: { value: 'local-newer' } } },
    { component: { b1: { value: 'server-stale' }, b2: { value: 'new' } } },
  );
  expect(next.component.b1.value).toBe('local-newer');
  expect(next.component.b2.value).toBe('new');
});

test('nothing to adopt returns the same state object', () => {
  const state = { component: { b1: { value: 'x' } } };
  expect(adopt(state, { component: { b1: { value: 'y' } } })).toBe(state);
  expect(adopt(state, undefined)).toBe(state);
});
