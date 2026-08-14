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
import { MemoryKVStore, type KVStore } from '@/lib/storage/kvs';
import { FieldPersister } from '@/lib/state/sync/persistence';
import { UserStateRegistry } from '@/lib/state/sync/registry';
import { SubscriptionRegistry } from '@/lib/state/sync/subscriptions';
import { makeSharedFieldPolicyIndex } from '@/lib/state/sync/fieldLevels';
import { stateForContentFetch } from '@/lib/state/sync/contentState';
import { kvsKey, type SafeUserId } from '@/lib/types/identity';
import { ALL, userInstance, setInstance, subscriptionKey } from '@/lib/state/sync/levels';
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
    // There is no file behind this fake, so "the bytes reached the file" is
    // vacuously true; appendEventDurable awaits this after each flush.
    fileWritten: Promise.resolve(),
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

/** Content-declared field levels (fieldLevels.ts) — the TRUSTED routing
 * input. The wire's authority stamp is self-description the router
 * ignores; without a declaration here, every field routes level 'user'. */
const levels = (map: Record<string, { level: 'everyone'; delivery: 'events' | 'folded' }>) => ({
  sharedPolicyFor: async (id: string, field: string) => map[`${id}|${field}`],
});

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
  const stored = await kvs.get(kvsKey.field(userInstance(USER.safe_user_id), 'component', 'pipe-block'));
  expect(JSON.parse(stored!).value).toBe('v1');
});

test('fields canonical: fetch_blob serves assembled field state', async () => {
  const kvs = new MemoryKVStore();
  // A previous session persisted per-field state.
  const p = new FieldPersister(kvs, userInstance(USER.safe_user_id), 0);
  p.stateChanged({
    system: {},
    component: { b: { value: 'from-fields' } },
    componentSetting: {},
    storage: { 'studio://course/file.olx': { content: 'draft content' } },
  });
  await p.close();

  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('from-fields');
  expect(fetch.data.application_state.storage['studio://course/file.olx'].content).toBe('draft content');
});

test('fields canonical falls back to blob for users without field state', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: {
      component: { b: { value: 'legacy-blob' } },
      storage: { 'studio://course/file.olx': { content: 'legacy draft' } },
    },
  }));
  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('legacy-blob');
  expect(fetch.data.application_state.storage['studio://course/file.olx'].content).toBe('legacy draft');
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

  const stored = await kvs.get(kvsKey.field(userInstance(USER.safe_user_id), 'component', 'pipe-block'));
  expect(JSON.parse(stored!).value).toBe('newer');
});

test('level everyone: two DIFFERENT users fold into one value', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };
  // Content declares shared-block.value level everyone — the router
  // routes by THIS, not the event's authority stamp.
  const fieldLevels = levels({ 'shared-block|value': { level: 'everyone', delivery: 'events' } });

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // B's content fetch subscribed it to the block (subscription-scoped
  // fan-out); C is connected but NOT subscribed and must hear nothing.
  subs.subscribe(wsB as any, [subscriptionKey(ALL, 'shared-block')]);
  const wsC = new FakeWs();
  const ctxC: PipelineContext = { ws: wsC as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels };
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
  const shared = await registry.read(ALL);
  expect(shared!.component['shared-block'].value).toBe('ours');
  const own = await registry.read(userInstance(USER.safe_user_id));
  expect(own?.component?.['shared-block']).toBeUndefined();

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);

  // Persisted under the shared pseudo-user for the next cold start.
  const stored = await kvs.get(kvsKey.field(ALL, 'component', 'shared-block'));
  expect(JSON.parse(stored!).value).toBe('ours');
});

test('folded delivery: contributions stay private; everyone gets the derived state', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };
  const fieldLevels = levels({ 'poll-block|contribution': { level: 'everyone', delivery: 'folded' } });

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // B's content fetch subscribed it to the poll block.
  subs.subscribe(wsB as any, [subscriptionKey(ALL, 'poll-block')]);

  // A "votes": a raw contribution event on the folded-delivery field.
  // (No registered fold for this event in the test registry, so the
  // legacy-spread path materializes { contribution } into the bucket —
  // enough to verify routing and the state-not-event fan.)
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_TESTCOUNTS', scope: 'component', field: 'contribution',
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
  const own = await registry.read(userInstance(USER.safe_user_id));
  expect(own?.component?.['poll-block']).toBeUndefined();

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('a forged authority stamp cannot reach shared state', async () => {
  // Routing derives the level from content declarations (fieldLevels),
  // never the wire — a client stamping authority on an undeclared field
  // writes only its own copy (local Codex review, 2026-07: "server
  // trusts client-supplied authority").
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();

  // No fieldLevels declaration for pipe-block at all — but the client
  // claims the field is shared.
  const { ctx } = await drive(
    { kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels: levels({}) },
    [{ ...UPDATE, authority: 'shared' }]);

  // The write landed in the sender's OWN instance, not the shared one.
  const own = await registry.read(userInstance(USER.safe_user_id));
  expect(own!.component['pipe-block'].value).toBe('v1');
  expect((await registry.read(ALL))?.component?.['pipe-block']).toBeUndefined();
  await ctx.persister!.close();
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
  const fieldLevels = levels({ 'demos/chat|value': { level: 'everyone', delivery: 'events' } });

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
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
  expect([...subs.subscribers(subscriptionKey(setInstance('topic_picker.activeIndex', '0'), 'demos/chat'))]).toContain(wsA);
  expect([...subs.subscribers(subscriptionKey(setInstance('topic_picker.activeIndex', '1'), 'demos/chat'))]).toContain(wsB);

  // A writes into the shared chat — lands in partition 0.
  wsA.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: 'demos/chat', value: 'cats only' })));
  await new Promise(r => setTimeout(r, 20));

  // The shared materialization bucketed by partition key...
  const shared = await registry.read(ALL);
  const cats = await registry.read(setInstance('topic_picker.activeIndex', '0'));
  expect(cats!.component['demos/chat'].value).toBe('cats only');
  expect(shared?.component?.['demos/chat']).toBeUndefined();
  // ...and B (Dogs partition) heard NOTHING.
  expect(wsB.sent.find(m => m.status === 'browser_event')).toBeUndefined();

  // B writes; A (subscribed to partition 0 via its own write) is silent.
  wsB.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: 'demos/chat', value: 'dogs only', actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));
  expect((await registry.read(setInstance('topic_picker.activeIndex', '1')))!.component['demos/chat'].value).toBe('dogs only');
  expect(wsA.sent.find(m => m.status === 'browser_event')).toBeUndefined();

  // A switches to Dogs: subscriptions swap AND A receives the Dogs
  // partition's bucket as a state patch (its UI updates without reload).
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 1, ts: 2, actor: 'a' })));
  await new Promise(r => setTimeout(r, 20));
  expect([...subs.subscribers(subscriptionKey(setInstance('topic_picker.activeIndex', '1'), 'demos/chat'))]).toContain(wsA);
  expect([...subs.subscribers(subscriptionKey(setInstance('topic_picker.activeIndex', '0'), 'demos/chat'))]).not.toContain(wsA);
  const switchPatch = wsA.sent.find(m => m.event_type === 'lo_server_state');
  expect(switchPatch.detail.sharedComponent['demos/chat'].value).toBe('dogs only');

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('scoped instances route by their LEAF definition: level, partition, fan-out', async () => {
  // The bug this pins: all three sync-engine consumers used to slice a
  // state id at the first '#' (a pre-id-grammar "defId#anchor" dialect).
  // Against a real colon-scoped key ("demos/list:#2:chat") that yields
  // "demos/list:" — a miss everywhere: the shared declaration was lost
  // (routed private), the grouping spec was lost (routed to `all`), and
  // definition subscribers never heard the event.
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };
  const SCOPED = 'demos/list:#2:chat';

  // The REAL level index (not the map stub): declarations live on the
  // leaf DEFINITION, so the scoped instance must resolve through it.
  const fieldLevels = makeSharedFieldPolicyIndex(
    async () => ({ 'demos/chat': { v1: { tag: 'SharedChat' } } }),
    (tag: string) => (tag === 'SharedChat'
      ? { value: { name: 'value', level: 'everyone' } } as any : undefined),
  );
  // Grouping is likewise keyed by definition.
  const grouping = {
    specOf: async (id: string) =>
      id === 'demos/chat' ? 'topic_picker.activeIndex' : undefined,
    groupedBlocksFor: async (pickerKey: string, field: string) =>
      pickerKey === 'demos/topic_picker' && field === 'activeIndex'
        ? ['demos/chat'] : [],
  };

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // Both pick Cats (0) — same partition.
  for (const [ws, actor] of [[wsA, 'a'], [wsB, 'b']] as const) {
    ws.emit('message', Buffer.from(JSON.stringify({
      event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
      id: 'demos/topic_picker', activeIndex: 0, ts: 1, actor })));
  }
  await new Promise(r => setTimeout(r, 20));

  // B's content fetch subscribed it by DEFINITION key — nobody fetches
  // "demos/list:#2:chat", the list's content fetch names the definitions.
  const cats = setInstance('topic_picker.activeIndex', '0');
  subs.subscribe(wsB as any, [subscriptionKey(cats, 'demos/chat')]);

  wsA.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: SCOPED, value: 'scoped cats' })));
  await new Promise(r => setTimeout(r, 20));

  // Shared (the declaration was found) AND in A's partition (the
  // grouping spec was found), not `all` and not A's private instance.
  expect((await registry.read(cats))!.component[SCOPED].value).toBe('scoped cats');
  expect((await registry.read(ALL))?.component?.[SCOPED]).toBeUndefined();
  expect((await registry.read(userInstance(USER.safe_user_id)))?.component?.[SCOPED]).toBeUndefined();
  // ...and the definition subscriber heard the scoped instance's event.
  expect(wsB.sent.find(m => m.status === 'browser_event')?.detail.value).toBe('scoped cats');

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('switching groups drops stale SCOPED self-subscriptions in the old partition', async () => {
  // The bug this pins: a writer self-subscribes under its event's RAW state
  // id, so writing a scoped grouped item subscribes `set:...|demos/list:#2:chat`.
  // The group switch only knew the DEFINITION id ('demos/chat') and dropped
  // keys by `endsWith('|demos/chat')` — the scoped key survived in the OLD
  // partition and the switched user kept hearing its events. Cross-partition
  // leak. The switch now matches by LEAF definition.
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };
  const SCOPED = 'demos/list:#2:chat';

  const fieldLevels = makeSharedFieldPolicyIndex(
    async () => ({ 'demos/chat': { v1: { tag: 'SharedChat' } } }),
    (tag: string) => (tag === 'SharedChat'
      ? { value: { name: 'value', level: 'everyone' } } as any : undefined),
  );
  const grouping = {
    specOf: async (id: string) =>
      id === 'demos/chat' ? 'topic_picker.activeIndex' : undefined,
    groupedBlocksFor: async (pickerKey: string, field: string) =>
      pickerKey === 'demos/topic_picker' && field === 'activeIndex'
        ? ['demos/chat'] : [],
  };

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // Both pick Cats (0), then A writes the scoped item — self-subscribing
  // to `set:...:0|demos/list:#2:chat`.
  for (const [ws, actor] of [[wsA, 'a'], [wsB, 'b']] as const) {
    ws.emit('message', Buffer.from(JSON.stringify({
      event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
      id: 'demos/topic_picker', activeIndex: 0, ts: 1, actor })));
  }
  await new Promise(r => setTimeout(r, 20));
  wsA.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: SCOPED, value: 'scoped cats' })));
  await new Promise(r => setTimeout(r, 20));
  const cats = setInstance('topic_picker.activeIndex', '0');
  expect([...subs.subscribers(subscriptionKey(cats, SCOPED))]).toContain(wsA);

  // A switches to Dogs (1).
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 1, ts: 2, actor: 'a' })));
  await new Promise(r => setTimeout(r, 20));
  expect([...subs.subscribers(subscriptionKey(cats, SCOPED))]).not.toContain(wsA);

  // B (still in Cats) writes the same scoped item: A must hear NOTHING.
  const beforeA = wsA.sent.length;
  wsB.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: SCOPED, value: 'cats again', actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));
  expect(wsA.sent.slice(beforeA).filter(m => m.status === 'browser_event')).toEqual([]);

  // ...and A still hears scoped events in its NEW partition, via the
  // definition subscription the switch created.
  wsB.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 1, ts: 3, actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));
  const beforeDogs = wsA.sent.length;
  wsB.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: SCOPED, value: 'dogs scoped', actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));
  expect(wsA.sent.slice(beforeDogs)
    .find(m => m.status === 'browser_event')?.detail.value).toBe('dogs scoped');

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('a content fetch carries the SCOPED shared buckets, not just the definition', async () => {
  // The bug this pins: sharedStateFor picked buckets by the served
  // DEFINITION id only (`scopes.component[id]`). A list's scoped shared
  // instances ("demos/list:#2:chat") live under their own state ids, so a
  // client rejoining a shared list got the plain bucket and nothing else
  // — an empty list until someone wrote again. The fetch now includes
  // every bucket whose LEAF definition is a served id (found by review
  // 2026-08; stateIdsForDefinition in state/sync/levels.ts).
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();

  // A previous session's shared state: the plain definition bucket AND
  // two scoped instances of it, in the caller's partition (here `all`).
  const p = new FieldPersister(kvs, ALL, 0);
  p.stateChanged({
    system: {}, componentSetting: {}, storage: {},
    component: {
      'demos/chat': { value: 'plain' },
      'demos/list:#2:chat': { value: 'scoped 2' },
      'demos/list:#7:chat': { value: 'scoped 7' },
      'demos/other': { value: 'not served' },
    },
  } as any);
  await p.close();

  // The content response names DEFINITIONS — nobody fetches a scoped id.
  const fieldState = await stateForContentFetch(
    registry, subs, USER.safe_user_id, { 'demos/chat': { v1: {} } });

  const shared = fieldState!.sharedComponent;
  expect(shared['demos/chat'].value).toBe('plain');
  expect(shared['demos/list:#2:chat'].value).toBe('scoped 2');
  expect(shared['demos/list:#7:chat'].value).toBe('scoped 7');
  // Unserved definitions still stay out.
  expect(shared['demos/other']).toBeUndefined();
});

test('switching groups patches SCOPED instances, not just the definition bucket', async () => {
  // The bug this pins: the switch patched only `component[blockId]`, so a
  // user moving partitions kept the OLD group's scoped list items on
  // screen — and got nothing from the new partition when it holds only
  // scoped buckets. The patch is now per matching state id.
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };
  const SCOPED = 'demos/list:#2:chat';

  const fieldLevels = makeSharedFieldPolicyIndex(
    async () => ({ 'demos/chat': { v1: { tag: 'SharedChat' } } }),
    (tag: string) => (tag === 'SharedChat'
      ? { value: { name: 'value', level: 'everyone' } } as any : undefined),
  );
  const grouping = {
    specOf: async (id: string) =>
      id === 'demos/chat' ? 'topic_picker.activeIndex' : undefined,
    groupedBlocksFor: async (pickerKey: string, field: string) =>
      pickerKey === 'demos/topic_picker' && field === 'activeIndex'
        ? ['demos/chat'] : [],
  };

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, fieldLevels, grouping };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);

  // A in Cats (0) writes the scoped item; B in Dogs (1) writes its own.
  // Neither partition has a bucket under the PLAIN definition id — the
  // shared state here is scoped-only, as a list's contents always are.
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 0, ts: 1, actor: 'a' })));
  wsB.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 1, ts: 1, actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));
  wsA.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: SCOPED, value: 'scoped cats' })));
  wsB.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, authority: 'shared', id: SCOPED, value: 'scoped dogs', actor: 'b' })));
  await new Promise(r => setTimeout(r, 20));

  // A switches to Dogs: it must be TOLD the Dogs partition's scoped
  // bucket, under the scoped state id.
  const before = wsA.sent.length;
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 1, ts: 2, actor: 'a' })));
  await new Promise(r => setTimeout(r, 20));
  const patches = wsA.sent.slice(before).filter(m => m.event_type === 'lo_server_state');
  const scopedPatch = patches.find(m => m.detail.sharedComponent[SCOPED]);
  expect(scopedPatch.detail.sharedComponent[SCOPED].value).toBe('scoped dogs');

  // And switching BACK blanks the fields the new partition lacks, so the
  // old group's scoped text cannot linger.
  wsA.emit('message', Buffer.from(JSON.stringify({
    event: 'UPDATE_ACTIVEINDEX', field: 'activeIndex', scope: 'component',
    id: 'demos/topic_picker', activeIndex: 2, ts: 3, actor: 'a' })));
  await new Promise(r => setTimeout(r, 20));
  const blanked = wsA.sent.filter(m => m.event_type === 'lo_server_state')
    .filter(m => m.detail.sharedComponent[SCOPED]).at(-1);
  expect(blanked.detail.sharedComponent[SCOPED].value).toBe('');

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('aggregation: one user, one count — twelve rewrites do not stuff the vote', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();
  const USER_B: AuthUser = { ...USER, user_id: 'Other', safe_user_id: 'guest-Other' as SafeUserId };
  // Content: a view block aggregating demos/q's value field.
  const aggregations = {
    viewsFor: async (targetId: string, field: string) =>
      targetId === 'demos/q' && field === 'value'
        ? [{
            viewId: 'demos/dist', resultField: 'distribution',
            spec: {
              over: 'value',
              initial: {},
              fold: (d: Record<string, number>, { prev, next }: any) => {
                const counts = { ...d };
                if (prev != null && prev !== '') {
                  counts[String(prev)] = (counts[String(prev)] ?? 1) - 1;
                  if (counts[String(prev)] <= 0) delete counts[String(prev)];
                }
                if (next != null && next !== '') {
                  counts[String(next)] = (counts[String(next)] ?? 0) + 1;
                }
                return counts;
              },
            },
          }]
        : [],
  };

  const wsA = new FakeWs();
  const wsB = new FakeWs();
  const ctxA: PipelineContext = { ws: wsA as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, aggregations };
  const ctxB: PipelineContext = { ws: wsB as any, user: USER_B, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs, aggregations };
  const runA = runPipeline(ctxA);
  const runB = runPipeline(ctxB);
  subs.subscribe(wsB as any, [subscriptionKey(ALL, 'demos/dist')]);

  const answer = (ws: FakeWs, value: string, ts: number) =>
    ws.emit('message', Buffer.from(JSON.stringify({
      event: 'UPDATE_VALUE', field: 'value', scope: 'component',
      id: 'demos/q', value, ts, actor: 'x' })));

  // A tries to stuff the ballot: twelve identical answers.
  for (let i = 1; i <= 12; i++) answer(wsA, 'Jupiter', i);
  // B answers once, then CHANGES their mind.
  answer(wsB, 'Saturn', 1);
  answer(wsB, 'Jupiter', 2);
  await new Promise(r => setTimeout(r, 30));

  const shared = await registry.read(ALL);
  // A counted once (identical rewrites are no-op transitions); B moved.
  expect(shared!.component['demos/dist'].distribution).toEqual({ Jupiter: 2 });
  // B (subscribed) received the derived patch, never raw contributions.
  const patch = wsB.sent.filter(m => m.event_type === 'lo_server_state').at(-1);
  expect(patch.detail.sharedComponent['demos/dist'].distribution).toEqual({ Jupiter: 2 });

  wsA.emit('close'); wsB.emit('close');
  await Promise.all([runA, runB]);
});

test('an event arriving BEFORE fetch_blob survives the seed', async () => {
  // Nothing enforces fetch-first: a fast writer's first event used to be
  // erased when the later seed replaced scopes wholesale (found by
  // review 2026-07). seed() now merges, live values winning.
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: { component: { stored: { value: 'from-store' } } },
  }));
  const { sent } = await drive({ kvs, canonical: 'fields' },
    [UPDATE, { event: 'fetch_blob' }]); // event FIRST, fetch second
  const fetch = sent.find(m => m.status === 'fetch_blob');
  // Both the pre-seed event and the stored state survive.
  expect(fetch.data.application_state.component['pipe-block'].value).toBe('v1');
  expect(fetch.data.application_state.component.stored.value).toBe('from-store');
});

test('a content fetch that raced the socket still subscribes it', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const subs = new SubscriptionRegistry();

  // The fetch arrived first: no sockets yet, keys recorded as pending.
  subs.notePending(USER.safe_user_id, [subscriptionKey(ALL, 'raced-block')]);

  const ws = new FakeWs();
  const ctx: PipelineContext = { ws: ws as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const run = runPipeline(ctx);
  await new Promise(r => setTimeout(r, 10));

  expect([...subs.subscribers(subscriptionKey(ALL, 'raced-block'))]).toContain(ws);

  // A SECOND tab that also fetched pre-socket must adopt the same keys —
  // adoption is not consumption (its fetch already happened; it will not
  // refetch).
  const ws2 = new FakeWs();
  const ctx2: PipelineContext = { ws: ws2 as any, user: USER, conn: fakeConn(), kvs, canonical: 'fields', stateRegistry: registry, subscriptions: subs };
  const run2 = runPipeline(ctx2);
  await new Promise(r => setTimeout(r, 10));
  expect([...subs.subscribers(subscriptionKey(ALL, 'raced-block'))]).toContain(ws2);

  ws.emit('close'); ws2.emit('close');
  await Promise.all([run, run2]);
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
  const live = await registry.read(userInstance(USER.safe_user_id));
  expect(live!.component['pipe-block'].value).toBe('v1');

  ws.emit('close');
  await run;

  // Cold: after the last release flushed, the same state reads from KVS.
  expect(registry.size()).toBe(0);
  const cold = await registry.read(userInstance(USER.safe_user_id));
  expect(cold!.component['pipe-block'].value).toBe('v1');
});

test('a failed durable append withholds the ack and tears the pipeline down', async () => {
  // The ack contract, from the failure side: decodeAndLog awaits
  // appendEventDurable BEFORE sending { status: 'ack' }, so an append that
  // cannot reach the log must produce NO ack. A future refactor that catches
  // the rejection and keeps acking would make the server claim durability for
  // an event that was never written — the exact bug Plane 1 exists to remove.
  // The rejection is also required to propagate: the connection's log is
  // broken, so the pipeline stops (and its `finally` releases state) rather
  // than running on silently.
  const kvs = new MemoryKVStore();
  const ws = new FakeWs();
  const conn = fakeConn();
  // A prior write error on this connection — appendEventDurable rejects
  // immediately on it, standing in for a mid-session ENOSPC. (The pump's own
  // capture of that error is covered in eventLog.test.ts.)
  conn.streamError = new Error('ENOSPC: no space left on device');
  const registry = new UserStateRegistry(kvs);
  const ctx: PipelineContext = {
    ws: ws as any, user: USER, conn, kvs, canonical: 'fields',
    stateRegistry: registry, subscriptions: new SubscriptionRegistry(),
  };
  const run = runPipeline(ctx);
  ws.emit('message', Buffer.from(JSON.stringify({
    ...UPDATE, metadata: { eventId: 'browser-t.session-t.1' } })));

  await expect(run).rejects.toThrow(/ENOSPC/);
  expect(ws.sent.filter(m => m.status === 'ack')).toHaveLength(0);
  // Teardown still ran: no phantom live entry left behind.
  expect(registry.size()).toBe(0);
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
