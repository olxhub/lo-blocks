// @vitest-environment node
// ensureBlock's content lane on the ledger: transient failures retry on
// CONTENT_RETRY's backoff, fatal failures (the server answered "no") never
// retry, a profile (locale) change refetches, and legacy LOAD_OLXJSON
// events with no fetch metadata still read ready.

import { test, expect, vi, beforeEach } from 'vitest';
import { updateResponseReducer } from '@/lib/state/store';
import {
  contentFreshness, CONTENT_RETRY, LOAD_OLXJSON, selectBlockState,
} from '@/lib/state/olxjson';
import { freshness, policies } from '@/lib/state/fieldLedger';
import { TEST_NS, testKey } from '@/lib/test-utils';

vi.mock('@/lib/content/fetchOlxJson', () => ({
  fetchFieldState: vi.fn(),
  fetchOlxJson: vi.fn(),
}));
vi.mock('@/lib/state/store', async (orig) => {
  const mod = await orig<typeof import('@/lib/state/store')>();
  // adoptFieldState targets the module-singleton store (not this test's) —
  // stub it out so a successful fetch doesn't reach for an uninitialized one.
  return { ...mod, adoptFieldState: vi.fn() };
});

import { fetchOlxJson } from '@/lib/content/fetchOlxJson';
import { ensureBlock } from './ensure';

const fetchMock = fetchOlxJson as ReturnType<typeof vi.fn>;
const KEY = testKey('note'); // CONTENT/note

/** A store whose logEvent routes OLXJSON events through the real reducer. */
function makeStore() {
  let appState = updateResponseReducer(undefined, { event: '@@INIT' });
  return {
    getState: () => ({ application_state: appState }),
    logEvent: (type: string, data: any) => {
      appState = updateResponseReducer(appState, { ...data, type, event: type });
    },
  };
}

function props(store: ReturnType<typeof makeStore>, locale = 'en') {
  return {
    runtime: {
      store,
      logEvent: store.logEvent,
      ns: TEST_NS,
      locale: { code: locale },
      sideEffectFree: false,
      blockRegistry: {},
    },
  } as any;
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const entryOf = (store: ReturnType<typeof makeStore>) =>
  selectBlockState(store.getState(), ['content'], KEY);

beforeEach(() => fetchMock.mockReset());

test('network failure → retry-wait, then eligible again after the backoff', async () => {
  const store = makeStore();
  // fetchOlxJson's .catch dispatches a TRANSIENT (fatal:false) error. Drive
  // the same OLXJSON_ERROR the .catch would, so the test is deterministic
  // and free of promise-timing artifacts.
  const guid = 'load-net';
  store.logEvent('OLXJSON_LOADING', { source: 'content', id: KEY, at: 1_000, loadGuid: guid, profile: 'en' });
  store.logEvent('OLXJSON_ERROR', {
    source: 'content', id: KEY, error: { message: 'network down' },
    fatal: false, at: 1_000, loadGuid: guid,
  });

  const entry = entryOf(store);
  const attempt = entry!.ledger.attempt!;
  expect(attempt).toMatchObject({ failures: 1, lastError: 'network down', fatal: false, profile: 'en' });
  // Immediately after the failure: waiting. After CONTENT_RETRY.baseMs: eligible.
  const failedAt = attempt.lastFailureAt!;
  const fresh = (now: number) =>
    freshness(entry!.ledger, { policy: policies.anyValid, retry: CONTENT_RETRY, now, loadGuid: guid, profile: 'en' });
  expect(fresh(failedAt + 100)).toBe('retry-wait');
  expect(fresh(failedAt + CONTENT_RETRY.baseMs + 1)).toBe('unknown');
});

test('fatal error → failed forever; ensureBlock no-ops', async () => {
  const store = makeStore();
  fetchMock.mockResolvedValue({ ok: false, idMap: {}, error: 'HTTP 404' });

  ensureBlock(props(store), 'note');
  await settle();

  const entry = entryOf(store);
  expect(entry!.ledger.attempt).toMatchObject({ fatal: true, lastError: 'HTTP 404' });
  // 'failed' regardless of how far in the future we look.
  expect(contentFreshness(entry, 'en')).toBe('failed');
  expect(freshness(entry!.ledger, {
    policy: policies.anyValid, retry: CONTENT_RETRY, now: Date.now() + 1e9, profile: 'en',
  })).toBe('failed');

  // A re-ensure sees 'failed' → does not refetch.
  ensureBlock(props(store), 'note');
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a profile (locale) change refetches; the old resolution is not lost', async () => {
  const store = makeStore();
  const variant = (lang: string) => ({
    [KEY]: { [lang]: { id: KEY, tag: 'TextBlock', attributes: {}, kids: [], source: '', parseDeps: [] } },
  });
  fetchMock.mockResolvedValue({ ok: true, idMap: variant('en-US') });

  ensureBlock(props(store, 'en'), 'note');
  await settle();
  expect(contentFreshness(entryOf(store), 'en')).toBe('ready');
  // Resolved under 'en' reads not-ready under 'ar' → the gate refetches.
  expect(contentFreshness(entryOf(store), 'ar')).not.toBe('ready');

  fetchMock.mockResolvedValue({ ok: true, idMap: variant('ar-SA') });
  ensureBlock(props(store, 'ar'), 'note');
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  // LOAD_OLXJSON merges variants — the 'en' variant survives the 'ar' load.
  const olx = entryOf(store)!.olxJson!;
  expect(Object.keys(olx).sort()).toEqual(['ar-SA', 'en-US']);
});

test('replayed legacy LOAD_OLXJSON without at/loadGuid reads ready', () => {
  // An event from an old log: no at/loadGuid/profile fields.
  const state = updateResponseReducer(undefined, {
    event: LOAD_OLXJSON, type: LOAD_OLXJSON, source: 'content',
    blocks: { [KEY]: { 'en-US': { id: KEY, tag: 'TextBlock', attributes: {}, kids: [], source: '', parseDeps: [] } } },
  });
  const entry = selectBlockState({ application_state: state } as any, ['content'], KEY);
  expect(entry!.ledger).toMatchObject({ resolvedAt: 0 });
  expect(contentFreshness(entry, 'en')).toBe('ready');
});
