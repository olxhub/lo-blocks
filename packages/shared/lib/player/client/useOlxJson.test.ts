// packages/shared/lib/player/client/useOlxJson.test.ts
//
// The "stuck spinner" invariants. One symptom — a block whose Redux entry
// holds complete olxJson data AND a sibling loadingState {status:'loading'}
// that nothing ever clears — reached from two directions:
//
//   RACE: a consumer checks "do we have this block?" (nothing yet), and its
//   OLXJSON_LOADING dispatch drains AFTER the bulk content lands. The marker
//   is written on top of good data and the render spins forever.
//
//   DEAD FETCH: the fetch armed by that consumer fails in a way that never
//   produces a clearing dispatch — a 200 + HTML SPA fallback, or an ok
//   response that simply doesn't contain the requested block.
//
// The invariants below: a marker never shadows data (write side and read
// side), a failed fetch always errors the marker, and an errored marker is
// retryable rather than terminal.

import { test, expect, vi, beforeEach } from 'vitest';
import { updateResponseReducer } from '@/lib/state/store';
import { LOAD_OLXJSON, OLXJSON_LOADING, OLXJSON_ERROR, selectBlock } from '@/lib/state/olxjson';
import { ensureBlock, selectOlxJson, selectOlxJsonMultiple } from './useOlxJson';
import { mockRuntime, TEST_NS, testKey } from '@/lib/test-utils';
import type { BaselineProps, DefinitionRef, UserLocale } from '@/lib/types';

const LOCALE = 'en-Latn-US' as UserLocale;
const ID = testKey('vibe_explainer');
const blocksFor = (id: string) => ({ [id]: { [LOCALE]: { id, tag: 'Html' } } });

/** Minimal store + logEvent that folds events exactly as the app does. */
function harness() {
  const events: any[] = [];
  let app: any = { olxjson: {} };
  const logEvent = (event: string, payload: any) => {
    events.push({ event, ...payload });
    app = updateResponseReducer(app, { event, ...payload });
  };
  const store = { getState: () => ({ application_state: app }) };
  const props: BaselineProps = {
    runtime: mockRuntime({
      sideEffectFree: false,
      ns: TEST_NS,
      store: store as any,
      logEvent,
      locale: { code: LOCALE, dir: 'ltr' },
    }),
  };
  return {
    props,
    events,
    state: () => ({ application_state: app }),
    entry: (id: string = ID) => app.olxjson.content?.[id],
    fold: (event: string, payload: any) => logEvent(event, payload),
  };
}

/** Fake fetch Response. `body` is sent verbatim as the response text. */
const response = (body: string, { ok = true, status = 200, contentType = 'application/json' } = {}) =>
  Promise.resolve({
    ok,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as any);

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ── Write side: a marker never lands on top of data ──────────────────────────

test('OLXJSON_LOADING does not shadow a block that already has data', () => {
  const h = harness();
  h.fold(LOAD_OLXJSON, { source: 'content', blocks: blocksFor(ID) });
  h.fold(OLXJSON_LOADING, { source: 'content', id: ID });

  expect(h.entry().loadingState.status).toBe('ready');
  expect(h.entry().olxJson[LOCALE].tag).toBe('Html');
});

test('OLXJSON_LOADING still marks a block we have nothing for', () => {
  const h = harness();
  h.fold(OLXJSON_LOADING, { source: 'content', id: ID });
  expect(h.entry().loadingState.status).toBe('loading');
});

test('an errored block can be re-marked as loading (retry is visible)', () => {
  const h = harness();
  h.fold(OLXJSON_ERROR, { source: 'content', id: ID, error: { message: 'boom' } });
  h.fold(OLXJSON_LOADING, { source: 'content', id: ID });
  expect(h.entry().loadingState.status).toBe('loading');
});

// ── Read side: data wins over a marker that got in anyway ────────────────────

test('selectOlxJson returns the data when a stale loading marker sits beside it', () => {
  const h = harness();
  // Hand-build the corrupt shape the production dump showed — this is what
  // replay, a server fold, or an older client can still hand us.
  const state = {
    application_state: {
      olxjson: {
        content: {
          [ID]: { olxJson: blocksFor(ID)[ID], loadingState: { status: 'loading' } },
        },
      },
    },
  } as any;

  const result = selectOlxJson(state, h.props, ID as unknown as DefinitionRef);
  expect(result.status).toBe('ready');
  expect(result.loading).toBe(false);
  expect(result.olxJson?.tag).toBe('Html');

  const multi = selectOlxJsonMultiple(state, h.props, [ID as unknown as DefinitionRef]);
  expect(multi.results[0].status).toBe('ready');
  expect(multi.allReady).toBe(true);

  expect(selectBlock(state, ['content'], ID, LOCALE)?.tag).toBe('Html');
});

test('selectOlxJson still reports loading when there is genuinely no data', () => {
  const h = harness();
  h.fold(OLXJSON_LOADING, { source: 'content', id: ID });
  const result = selectOlxJson(h.state(), h.props, ID as unknown as DefinitionRef);
  expect(result.status).toBe('loading');
  expect(result.olxJson).toBeNull();
});

// ── The race, end to end ────────────────────────────────────────────────────

test('bulk content landing between ensureBlock check and dispatch leaves the block readable', async () => {
  const id = testKey('race_block');
  const h = harness();
  let resolveFetch: (v: any) => void = () => {};
  vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolveFetch = r; })));

  // Consumer mounts before the bulk dispatch has folded: marker written…
  ensureBlock(h.props, id as unknown as DefinitionRef);
  // …then all.json lands with the real content.
  h.fold(LOAD_OLXJSON, { source: 'content', blocks: blocksFor(id) });
  // …and the in-flight single-block fetch answers with the same content.
  resolveFetch(await response(JSON.stringify({ ok: true, idMap: blocksFor(id) })));
  await vi.waitFor(() => expect(h.entry(id).loadingState.status).toBe('ready'));

  const result = selectOlxJson(h.state(), h.props, id as unknown as DefinitionRef);
  expect(result.status).toBe('ready');
  expect(result.olxJson?.tag).toBe('Html');
});

// ── Failure always clears the marker ────────────────────────────────────────

test('a 200 + HTML response (static SPA fallback) errors the marker instead of hanging', async () => {
  const id = testKey('html_fallback');
  const h = harness();
  vi.stubGlobal('fetch', vi.fn(() =>
    response('<!doctype html><html><body>app</body></html>', { contentType: 'text/html' })));

  ensureBlock(h.props, id as unknown as DefinitionRef);
  await vi.waitFor(() => expect(h.entry(id).loadingState.status).toBe('error'));
  expect(h.entry(id).error.message).toMatch(/non-JSON/);

  // …and the block is retryable: a later mount re-arms the fetch.
  const fetchAgain = vi.fn(() => response(JSON.stringify({ ok: true, idMap: blocksFor(id) })));
  vi.stubGlobal('fetch', fetchAgain);
  ensureBlock(h.props, id as unknown as DefinitionRef);
  expect(fetchAgain).toHaveBeenCalled();
  await vi.waitFor(() => expect(h.entry(id).loadingState.status).toBe('ready'));
});

test('an ok response that omits the requested block errors the marker', async () => {
  const id = testKey('absent_block');
  const h = harness();
  vi.stubGlobal('fetch', vi.fn(() => response(JSON.stringify({ ok: true, idMap: {} }))));

  ensureBlock(h.props, id as unknown as DefinitionRef);
  await vi.waitFor(() => expect(h.entry(id).loadingState.status).toBe('error'));
  expect(h.entry(id).error.message).toMatch(/did not contain/);
});

test('a 404 errors the marker and is NOT retried (no storm on missing content)', async () => {
  const id = testKey('missing_block');
  const h = harness();
  const fetchMock = vi.fn(() => response(JSON.stringify({ ok: false, error: 'No content found' }),
    { ok: false, status: 404 }));
  vi.stubGlobal('fetch', fetchMock);

  ensureBlock(h.props, id as unknown as DefinitionRef);
  await vi.waitFor(() => expect(h.entry(id).loadingState.status).toBe('error'));

  ensureBlock(h.props, id as unknown as DefinitionRef);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a network rejection errors the marker and stays retryable', async () => {
  const id = testKey('network_fail');
  const h = harness();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

  ensureBlock(h.props, id as unknown as DefinitionRef);
  await vi.waitFor(() => expect(h.entry(id).loadingState.status).toBe('error'));

  const fetchAgain = vi.fn(() => response(JSON.stringify({ ok: true, idMap: blocksFor(id) })));
  vi.stubGlobal('fetch', fetchAgain);
  ensureBlock(h.props, id as unknown as DefinitionRef);
  expect(fetchAgain).toHaveBeenCalled();
});

test('a late error cannot knock loaded content back to error', async () => {
  const id = testKey('late_error');
  const h = harness();
  h.fold(LOAD_OLXJSON, { source: 'content', blocks: blocksFor(id) });
  h.fold(OLXJSON_ERROR, { source: 'content', id, error: { message: 'late 404' } });
  expect(h.entry(id).loadingState.status).toBe('ready');
});
