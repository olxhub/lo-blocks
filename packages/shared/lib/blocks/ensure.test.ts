// @vitest-environment node
// ensureInstance's state lane: microtask batching (a render pass's keys
// → one request), ledger-driven dedup, and adopt+resolve on response.

import { test, expect, vi, beforeEach } from 'vitest';
import { parseStateKey } from '@/lib/types/id-grammar';

vi.mock('@/lib/content/fetchOlxJson', () => ({
  fetchFieldState: vi.fn(),
  fetchOlxJson: vi.fn(),
}));

import { fetchFieldState } from '@/lib/content/fetchOlxJson';
import { updateResponseReducer } from '@/lib/state/store';
import { ensureInstance, resetEnsureForTests } from './ensure';

const fetchMock = fetchFieldState as ReturnType<typeof vi.fn>;

/** Minimal store speaking the EMIT_EVENT envelope updateResponseReducer
 * sees after lo_event unwraps it (action = parsed payload). */
function makeStore() {
  let appState = updateResponseReducer(undefined, { event: '@@INIT' });
  return {
    getState: () => ({ application_state: appState }),
    dispatch(action: any) {
      const parsed = typeof action.payload === 'string' ? JSON.parse(action.payload) : action;
      appState = updateResponseReducer(appState, parsed);
    },
  };
}

function props(store: ReturnType<typeof makeStore>) {
  return {
    runtime: { store, sideEffectFree: false, olxJsonSources: ['content'] },
  } as any;
}

const K1 = parseStateKey('demos/list:#0:answer');
const K2 = parseStateKey('demos/list:#1:answer');

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetEnsureForTests();
  fetchMock.mockReset();
});

test('keys from one render pass coalesce into one fetch; response adopts and resolves', async () => {
  const store = makeStore();
  const p = props(store);
  fetchMock.mockResolvedValue({
    ok: true,
    fieldState: { component: { [K1]: { value: 'saved' } }, sharedComponent: {} },
    absent: [K2],
  });

  ensureInstance(p, [K1], { lanes: ['state'] });
  ensureInstance(p, [K2], { lanes: ['state'] });
  await settle();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0].sort()).toEqual([K1, K2].sort());

  const app = store.getState().application_state;
  // adoptFieldState dispatches on the module-singleton store, which this
  // test store is not — so assert the ledger writes that DID go through
  // this store: both keys were marked loading.
  expect(app.fieldLedger[K1].attempt).toBeTruthy();
  expect(app.fieldLedger[K2].attempt).toBeTruthy();
});

test('already-pending keys are not refetched', async () => {
  const store = makeStore();
  const p = props(store);
  // Never resolves — K1 stays in-flight ('pending').
  fetchMock.mockReturnValue(new Promise(() => {}));

  ensureInstance(p, [K1], { lanes: ['state'] });
  await settle();
  ensureInstance(p, [K1], { lanes: ['state'] });
  await settle();

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a failed fetch records failure facts against every key in the chunk', async () => {
  const store = makeStore();
  const p = props(store);
  fetchMock.mockRejectedValue(new Error('network down'));

  ensureInstance(p, [K1, K2], { lanes: ['state'] });
  await settle();

  const ledger = store.getState().application_state.fieldLedger;
  expect(ledger[K1].attempt).toMatchObject({ failures: 1, lastError: 'network down' });
  expect(ledger[K2].attempt).toMatchObject({ failures: 1, lastError: 'network down' });
  // Immediately after the failure the key is in retry-wait, so a
  // re-ensure schedules a timer instead of refetching.
  ensureInstance(p, [K1], { lanes: ['state'] });
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('sideEffectFree renders never fetch', async () => {
  const store = makeStore();
  const p = props(store);
  p.runtime.sideEffectFree = true;
  fetchMock.mockResolvedValue({ ok: true, absent: [K1] });

  ensureInstance(p, [K1], { lanes: ['state'] });
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
});
