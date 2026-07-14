// @vitest-environment node
// fieldLedger: timestamped facts in, derived freshness out. The ledger
// never stores a status — policies interpret the facts at read time, so
// a stale entry can't lie the way a persisted 'loading' flag would.

import { test, expect } from 'vitest';
import {
  fieldLedgerReducer, freshness, policies, STATE_RETRY,
  FIELDSTATE_LOADING, FIELDSTATE_RESOLVED, FIELDSTATE_ERROR,
  type FieldLedgerState,
} from './fieldLedger';

const GUID = 'load-1';
const OTHER_GUID = 'load-0';
const T0 = 1_000_000;

const at = (state: FieldLedgerState, type: string, keys: string[], extra = {}) =>
  fieldLedgerReducer(state, { type, keys, at: T0, loadGuid: GUID, ...extra });

test('never-seen key is unknown; loading makes it pending', () => {
  expect(freshness(undefined, { now: T0, loadGuid: GUID })).toBe('unknown');
  const state = at({}, FIELDSTATE_LOADING, ['k']);
  expect(freshness(state.k, { now: T0, loadGuid: GUID })).toBe('pending');
});

test('resolved under the current load is ready (default policy)', () => {
  const state = at({}, FIELDSTATE_RESOLVED, ['k']);
  expect(state.k).toEqual({ resolvedAt: T0, loadGuid: GUID });
  expect(freshness(state.k, { now: T0 + 1, loadGuid: GUID })).toBe('ready');
});

test('a previous page load\'s resolution is stale under currentLoad, ready under anyValid', () => {
  const entry = { resolvedAt: T0, loadGuid: OTHER_GUID };
  expect(freshness(entry, { now: T0 + 1, loadGuid: GUID })).toBe('unknown');
  expect(freshness(entry, { policy: policies.anyValid, now: T0 + 1, loadGuid: GUID })).toBe('ready');
});

test('offlineWindow: recent resolutions pass, old ones do not', () => {
  const entry = { resolvedAt: T0, loadGuid: OTHER_GUID };
  const week = 7 * 24 * 3600 * 1000;
  expect(freshness(entry, { policy: policies.offlineWindow(week), now: T0 + week - 1, loadGuid: GUID }))
    .toBe('ready');
  expect(freshness(entry, { policy: policies.offlineWindow(week), now: T0 + week + 1, loadGuid: GUID }))
    .toBe('unknown');
});

test('ephemeral is always ready', () => {
  expect(freshness(undefined, { policy: policies.ephemeral, now: T0, loadGuid: GUID })).toBe('ready');
});

test('failure facts drive declarative retry: wait, then eligible again', () => {
  let state = at({}, FIELDSTATE_LOADING, ['k']);
  state = at(state, FIELDSTATE_ERROR, ['k'], { error: 'boom' });
  expect(state.k.attempt).toMatchObject({ failures: 1, lastFailureAt: T0, lastError: 'boom' });

  // "Tried at T0, one failure so far. We might try again if it's at
  // least 500ms later." (STATE_RETRY.baseMs)
  expect(freshness(state.k, { now: T0 + 100, loadGuid: GUID })).toBe('retry-wait');
  expect(freshness(state.k, { now: T0 + STATE_RETRY.baseMs + 1, loadGuid: GUID })).toBe('unknown');
});

test('failures carry across attempts within a load; out of attempts = failed', () => {
  let state: FieldLedgerState = {};
  for (let i = 0; i < STATE_RETRY.attempts; i++) {
    state = at(state, FIELDSTATE_LOADING, ['k']);
    state = at(state, FIELDSTATE_ERROR, ['k']);
  }
  expect(state.k.attempt!.failures).toBe(STATE_RETRY.attempts);
  expect(freshness(state.k, { now: T0 + 1e9, loadGuid: GUID })).toBe('failed');
});

test('a dead page load\'s attempt reads as unknown, and a fresh load restarts the count', () => {
  let state = at({}, FIELDSTATE_LOADING, ['k']);
  state = at(state, FIELDSTATE_ERROR, ['k']);
  // Next page load: the old attempt's guid no longer matches.
  expect(freshness(state.k, { now: T0, loadGuid: 'load-2' })).toBe('unknown');
  const next = fieldLedgerReducer(state, {
    type: FIELDSTATE_LOADING, keys: ['k'], at: T0 + 10, loadGuid: 'load-2',
  });
  expect(next.k.attempt).toMatchObject({ loadGuid: 'load-2', failures: 0 });
});

test('resolution clears attempt facts', () => {
  let state = at({}, FIELDSTATE_LOADING, ['k']);
  state = at(state, FIELDSTATE_ERROR, ['k']);
  state = at(state, FIELDSTATE_RESOLVED, ['k']);
  expect(state.k.attempt).toBeUndefined();
  expect(freshness(state.k, { now: T0, loadGuid: GUID })).toBe('ready');
});

test('malformed actions are ignored', () => {
  const state: FieldLedgerState = { k: { resolvedAt: T0, loadGuid: GUID } };
  expect(fieldLedgerReducer(state, { type: FIELDSTATE_LOADING, keys: [], at: T0 })).toBe(state);
  expect(fieldLedgerReducer(state, { type: FIELDSTATE_LOADING, keys: ['k'] })).toBe(state);
  expect(fieldLedgerReducer(state, { type: 'UNRELATED', keys: ['k'], at: T0 })).toBe(state);
});
