// @vitest-environment node
// apps/server/src/pipeline.test.ts
//
// End-to-end pipeline tests over a fake WebSocket: the canonical switch
// (blob vs fields on fetch_blob), field persistence as events reduce,
// and blob fallback for users who predate the field store.

import { test, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { runPipeline, type PipelineContext } from './pipeline.js';
import { MemoryKVStore, type KVStore } from './kvs.js';
import { FieldPersister } from './fieldStore.js';
import { UserStateRegistry } from './userState.js';
import { SubscriptionRegistry } from './subscriptions.js';
import { kvsKey, type SafeUserId } from '@/lib/types/identity';
import type { AuthUser } from './auth.js';
import type { ConnectionLog } from './eventLog.js';

const USER: AuthUser = {
  user_id: 'PipeTester', provenance: 'guest',
  safe_user_id: 'guest-PipeTester' as SafeUserId, authorized: false,
} as AuthUser;

/** Minimal stand-in for the ws socket: emits 'message'/'close', records sends. */
class FakeWs extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
}

function fakeConn(): ConnectionLog {
  // Real gzip stream into the void — appendEvent needs .write only.
  const stream = zlib.createGzip();
  stream.resume();
  return {
    id: 'test-conn', user: USER, path: '/dev/null', stream,
    fileStream: null as any,
    log: { description: 'test', started: '', user: USER, eventCount: 0 } as any,
  };
}

/** Run the pipeline over a scripted message sequence; return sent frames.
 * Each call gets its own registry unless one is passed (multi-connection
 * tests share a registry the way one server process does). */
async function drive(
  ctx: Partial<PipelineContext> & { kvs: KVStore },
  messages: object[],
) {
  const ws = new FakeWs();
  const full: PipelineContext = {
    ws: ws as any, user: USER, conn: fakeConn(),
    stateRegistry: ctx.stateRegistry ?? new UserStateRegistry(ctx.kvs),
    subscriptions: ctx.subscriptions ?? new SubscriptionRegistry(),
    ...ctx,
  };
  const run = runPipeline(full);
  for (const m of messages) ws.emit('message', Buffer.from(JSON.stringify(m)));
  // Let queued messages drain through the async generators, then close.
  await new Promise(r => setTimeout(r, 20));
  ws.emit('close');
  await run;
  return { sent: ws.sent, ctx: full };
}

const UPDATE = {
  event: 'UPDATE_VALUE', field: 'value', scope: 'component',
  id: 'pipe-block', value: 'v1', ts: 1, actor: 'test',
};

test('blob canonical: fetch_blob serves the stored blob', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: { component: { b: { value: 'from-blob' } } },
  }));
  const { sent } = await drive({ kvs, canonical: 'blob' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('from-blob');
});

test('events persist to field keys as they reduce', async () => {
  const kvs = new MemoryKVStore();
  const { ctx } = await drive({ kvs, canonical: 'blob' }, [UPDATE]);
  await ctx.persister!.close();
  const stored = await kvs.get(kvsKey.field(USER.safe_user_id, 'component', 'pipe-block'));
  expect(JSON.parse(stored!).value).toBe('v1');
});

test('fields canonical: fetch_blob serves assembled field state', async () => {
  const kvs = new MemoryKVStore();
  // A previous session persisted per-field state.
  const p = new FieldPersister(kvs, USER.safe_user_id, 0);
  p.stateChanged({ system: {}, component: { b: { value: 'from-fields' } }, componentSetting: {} });
  await p.close();

  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('from-fields');
});

test('fields canonical falls back to blob for users without field state', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: { component: { b: { value: 'legacy-blob' } } },
  }));
  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('legacy-blob');
});

test('two live connections fold into ONE user state', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();

  // Open two overlapping connections for the same user.
  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // A writes without saving; B fetches and must see A's live event.
  wsA.emit('message', Buffer.from(JSON.stringify(UPDATE)));
  await new Promise(r => setTimeout(r, 20));
  wsB.emit('message', Buffer.from(JSON.stringify({ event: 'fetch_blob' })));
  await new Promise(r => setTimeout(r, 20));

  const fetched = wsB.sent.find(m => m.status === 'fetch_blob');
  expect(fetched.data.application_state.component['pipe-block'].value).toBe('v1');

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
  expect(registry.size()).toBe(0); // last release dropped the entry
});

test('fan-out: other connections hear an event; the origin does not', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  wsA.emit('message', Buffer.from(JSON.stringify(UPDATE)));
  await new Promise(r => setTimeout(r, 20));

  const relayed = wsB.sent.find(m => m.status === 'browser_event');
  expect(relayed.event_type).toBe('lo_server_event');
  expect(relayed.detail.event).toBe('UPDATE_VALUE');
  expect(relayed.detail.value).toBe('v1');
  // Echo suppression: the origin never hears its own event back.
  expect(wsA.sent.find(m => m.status === 'browser_event')).toBeUndefined();

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('LWW wins by timestamp, not by which connection closes last', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // B writes the NEWER value first; A then writes an OLDER one and is the
  // last connection to close. Pre-registry, A's private state flushed last
  // and clobbered B's. Now LWW rejects the stale write in the shared state.
  wsB.emit('message', Buffer.from(JSON.stringify({ ...UPDATE, value: 'newer', ts: 200 })));
  await new Promise(r => setTimeout(r, 20));
  wsA.emit('message', Buffer.from(JSON.stringify({ ...UPDATE, value: 'older', ts: 100 })));
  await new Promise(r => setTimeout(r, 20));

  wsB.emit('close');
  await runB;
  wsA.emit('close');
  await runA;

  const stored = await kvs.get(kvsKey.field(USER.safe_user_id, 'component', 'pipe-block'));
  expect(JSON.parse(stored!).value).toBe('newer');
});

test('shared authority: two DIFFERENT users fold into one value', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // B's content fetch subscribed it to the block (subscription-scoped
  // fan-out); C is connected but NOT subscribed and must hear nothing.
  subs.subscribe(wsB as any, ['shared-block']);
  const wsC = new FakeWs();
  const ctxC: PipelineContext = { ws: wsC as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const runC = runPipeline(ctxC);

  wsA.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: 'shared-block', value: 'ours' })));
  await new Promise(r => setTimeout(r, 20));

  // A different user hears the shared event (per-user fan-out would not
  // cross users)...
  const relayed = wsB.sent.find(m => m.status === 'browser_event');
  expect(relayed.detail.value).toBe('ours');
  // ...an unsubscribed connection does not...
  expect(wsC.sent.find(m => m.status === 'browser_event')).toBeUndefined();
  wsC.emit('close');
  await runC;
  // ...and it landed in the SHARED materialization, not user A's.
  const shared = await registry.read('_shared' as SafeUserId);
  expect(shared!.component['shared-block'].value).toBe('ours');
  const own = await registry.read(USER.safe_user_id);
  expect(own?.component?.['shared-block']).toBeUndefined();

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);

  // Persisted under the shared pseudo-user for the next cold start.
  const stored = await kvs.get(kvsKey.field('_shared' as SafeUserId, 'component', 'shared-block'));
  expect(JSON.parse(stored!).value).toBe('ours');
});

test('server authority: contributions stay private; everyone gets the derived state', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // B's content fetch subscribed it to the poll block.
  subs.subscribe(wsB as any, ['poll-block']);

  // A "votes": a raw contribution event with authority: 'server'.
  // (No registered fold for this event in the test registry, so the
  // legacy-spread path materializes { contribution } into the bucket —
  // enough to verify routing and the state-not-event fan.)
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_TESTCOUNTS', scope: 'component', authority: 'server',
    id: 'poll-block', contribution: 'Alpha',
  })));
  await new Promise(r => setTimeout(r, 20));

  // B receives a STATE patch (lo_server_state), never the raw event.
  const stateMsg = wsB.sent.find(m => m.event_type === 'lo_server_state');
  expect(stateMsg.detail.sharedComponent['poll-block'].contribution).toBe('Alpha');
  expect(wsB.sent.find(m => m.event_type === 'lo_server_event')).toBeUndefined();
  // The ORIGIN gets the authoritative state too (replaces optimistic fold).
  expect(wsA.sent.find(m => m.event_type === 'lo_server_state')).toBeTruthy();
  // Nothing landed in A's per-user state.
  const own = await registry.read(USER.safe_user_id);
  expect(own?.component?.['poll-block']).toBeUndefined();

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('grouped-by: users partition by their own picker field', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };
  // Content declares the chat block grouped by each user's topic choice.
  const grouping = {
    specOf: async (id: string) =>
      id === 'demos/chat' ? 'topic_picker.activeIndex' : undefined,
    groupedBlocksFor: async (pickerKey: string, field: string) =>
      pickerKey === 'demos/topic_picker' && field === 'activeIndex'
        ? ['demos/chat'] : [],
  };

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, grouping };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, grouping };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // A picks Cats (0), B picks Dogs (1) — ordinary per-user events.
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 0, ts: 1, actor: 'a' })));
  wsB.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 1, ts: 1, actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));

  // Picking moved each user's sockets to their partition automatically
  // (the group-switch path) — no manual subscription needed. This is the
  // exact flow that failed in the first browser test: subscribe at
  // fetch, pick later.
  expect([...subs.subscribers('demos/chat::0')]).toContain(wsA);
  expect([...subs.subscribers('demos/chat::1')]).toContain(wsB);

  // A writes into the shared chat — lands in partition 0.
  wsA.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: 'demos/chat', value: 'cats only' })));
  await new Promise(r => setTimeout(r, 20));

  // The shared materialization bucketed by partition key...
  const shared = await registry.read('_shared' as SafeUserId);
  expect(shared!.component['demos/chat::0'].value).toBe('cats only');
  expect(shared!.component['demos/chat']).toBeUndefined();
  // ...and B (Dogs partition) heard NOTHING.
  expect(wsB.sent.find(m => m.status === 'browser_event')).toBeUndefined();

  // B writes; A (subscribed to partition 0 via its own write) is silent.
  wsB.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: 'demos/chat', value: 'dogs only', actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));
  expect((await registry.read('_shared' as SafeUserId))!.component['demos/chat::1'].value).toBe('dogs only');
  expect(wsA.sent.find(m => m.status === 'browser_event')).toBeUndefined();

  // A switches to Dogs: subscriptions swap AND A receives the Dogs
  // partition's bucket as a state patch (its UI updates without reload).
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 1, ts: 2, actor: 'a' })));
  await new Promise(r => setTimeout(r, 20));
  expect([...subs.subscribers('demos/chat::1')]).toContain(wsA);
  expect([...subs.subscribers('demos/chat::0')]).not.toContain(wsA);
  const switchPatch = wsA.sent.find(m => m.event_type === 'lo_server_state');
  expect(switchPatch.detail.sharedComponent['demos/chat'].value).toBe('dogs only');

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('registry.read: live state when connected, stored state when not', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();

  // Live: an open connection's unsaved event is visible immediately.
  const ws = new FakeWs();
  const ctx: PipelineContext = { ws: ws as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const run = runPipeline(ctx);
  ws.emit('message', Buffer.from(JSON.stringify(UPDATE)));
  await new Promise(r => setTimeout(r, 20));
  const live = await registry.read(USER.safe_user_id);
  expect(live!.component['pipe-block'].value).toBe('v1');

  ws.emit('close');
  await run;

  // Cold: after the last release flushed, the same state reads from KVS.
  expect(registry.size()).toBe(0);
  const cold = await registry.read(USER.safe_user_id);
  expect(cold!.component['pipe-block'].value).toBe('v1');
});

test('fetch seed + events: assembled state accumulates across sessions', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: { system: {}, component: { old: { value: 'kept' } }, componentSetting: {} },
  }));
  // Session 1: fetch (seeds from blob), then a new event.
  const { ctx } = await drive({ kvs, canonical: 'fields' },
    [{ event: 'fetch_blob' }, UPDATE]);
  await ctx.persister!.close();

  // Session 2, fields canonical: both the seeded and the new bucket serve.
  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const state = sent.find(m => m.status === 'fetch_blob').data.application_state;
  expect(state.component.old.value).toBe('kept');
  expect(state.component['pipe-block'].value).toBe('v1');
});
