// @vitest-environment node
// packages/shared/lib/state/sync/contentState.test.ts
//
// stateForContentFetch: state bundled on a content response by
// CONSTRUCTED keys (served definition ids ARE the static state keys) —
// never by assembling and filtering the caller's whole instance.
// stateForKeys: the exact-key state fetch (demand-driven loading) —
// id-scoped reads, partition resolution via picker buckets only, and
// explicit absence confirmation.

import { test, expect } from 'vitest';
import { stateForContentFetch, stateForKeys } from './contentState';
import { UserStateRegistry } from './registry';
import { SubscriptionRegistry } from './subscriptions';
import { MemoryKVStore } from '@/lib/storage/kvs';
import { kvsKey, type SafeUserId } from '@/lib/types/identity';
import { parseStateKey } from '@/lib/types/id-grammar';
import { ALL, userInstance, setInstance, subscriptionKey } from './levels';

// ── stateForContentFetch ─────────────────────────────────────────────────

const P2 = 'guest-Fetcher' as SafeUserId;
const OWN2 = userInstance(P2);

test('own state comes from constructed keys; scoped instances never bundle', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const store = (instance: string, id: string, bucket: Record<string, any>) =>
    kvs.set(kvsKey.field(instance, 'component', id), JSON.stringify(bucket));
  await store(OWN2, 'demos/page1', { seen: true });
  await store(OWN2, 'demos/list:#0:answer', { value: 'dynamic instance' });
  await store(OWN2, 'demos/elsewhere', { value: 'other page' });

  const responseIdMap = { 'demos/page1': { v1: { tag: 'TextBlock' } } };
  const out = await stateForContentFetch(registry, new SubscriptionRegistry(), P2, responseIdMap);

  expect(out!.component).toEqual({ 'demos/page1': { seen: true } });
  // The scoped instance is enumerable only from student state — it rides
  // the exact-key fetch (stateForKeys) after its ancestor renders, never
  // the content bundle.
});

test('no state anywhere → null (response key omitted)', async () => {
  const registry = new UserStateRegistry(new MemoryKVStore());
  const out = await stateForContentFetch(
    registry, new SubscriptionRegistry(), P2, { 'demos/new': { v1: { tag: 'TextBlock' } } });
  expect(out).toBeNull();
});

test('grouped blocks resolve their partition through the picker bucket only', async () => {
  const kvs = new MemoryKVStore();
  const registry = new UserStateRegistry(kvs);
  const store = (instance: string, id: string, bucket: Record<string, any>) =>
    kvs.set(kvsKey.field(instance, 'component', id), JSON.stringify(bucket));
  await store(OWN2, 'demos/topic', { value: 'Cats' });
  await store(setInstance('topic.value', 'Cats'), 'demos/notes', { notes: 'cat notes' });
  await store(ALL, 'demos/notes', { notes: 'unpartitioned' });

  const responseIdMap = {
    'demos/notes': { v1: { tag: 'SharedNotes', attributes: { 'grouped-by': 'topic.value' } } },
  };
  const out = await stateForContentFetch(registry, new SubscriptionRegistry(), P2, responseIdMap);
  expect(out!.sharedComponent).toEqual({ 'demos/notes': { notes: 'cat notes' } });
});

// ── stateForKeys ─────────────────────────────────────────────────────────

const PRINCIPAL = 'guest-Tester' as SafeUserId;
const OWN = userInstance(PRINCIPAL);

function harness() {
  const kvs = new MemoryKVStore();
  return {
    kvs,
    registry: new UserStateRegistry(kvs),
    subscriptions: new SubscriptionRegistry(),
    store(instance: string, id: string, bucket: Record<string, any>) {
      return kvs.set(kvsKey.field(instance, 'component', id), JSON.stringify(bucket));
    },
  };
}

test('exact keys return own buckets; the rest are confirmed absent', async () => {
  const h = harness();
  await h.store(OWN, 'demos/list:#0:answer', { value: 'first' });
  await h.store(OWN, 'demos/list:#7:answer', { value: 'eighth' });
  await h.store(OWN, 'demos/elsewhere', { value: 'not asked for' });

  const keys = ['demos/list:#0:answer', 'demos/list:#7:answer', 'demos/list:#3:answer']
    .map(parseStateKey);
  const out = await stateForKeys(h.registry, h.subscriptions, PRINCIPAL, keys, {});

  expect(out.component).toEqual({
    'demos/list:#0:answer': { value: 'first' },
    'demos/list:#7:answer': { value: 'eighth' },
  });
  expect(out.absent).toEqual(['demos/list:#3:answer']);
  expect(out.component['demos/elsewhere']).toBeUndefined();
});

test('ephemeral keys answer absent by policy — no read, no subscription', async () => {
  // The router drops ephemeral (docs.) events, so "no state" is true by
  // construction; the gate needs the confirmation to stop waiting. Even
  // state persisted before the ephemeral policy must not surface.
  const h = harness();
  await h.store(OWN, 'docs.TextBlock/demo', { value: 'pre-policy leftover' });

  const out = await stateForKeys(
    h.registry, h.subscriptions, PRINCIPAL, [parseStateKey('docs.TextBlock/demo')], {});
  expect(out.component).toEqual({});
  expect(out.sharedComponent).toEqual({});
  expect(out.absent).toEqual(['docs.TextBlock/demo']);
});

test('shared buckets come from the `all` instance', async () => {
  const h = harness();
  await h.store(ALL, 'demos/poll', { votes: 12 });
  const out = await stateForKeys(
    h.registry, h.subscriptions, PRINCIPAL, [parseStateKey('demos/poll')], {});
  expect(out.sharedComponent).toEqual({ 'demos/poll': { votes: 12 } });
  expect(out.absent).toEqual([]);
});

test('grouped keys resolve their partition through the picker bucket only', async () => {
  const h = harness();
  const idMap = {
    'demos/notes': { v1: { tag: 'SharedNotes', attributes: { 'grouped-by': 'topic.value' } } },
  };
  await h.store(OWN, 'demos/topic', { value: 'Cats' });
  await h.store(setInstance('topic.value', 'Cats'), 'demos/notes', { notes: 'cat notes' });
  await h.store(ALL, 'demos/notes', { notes: 'unpartitioned' });

  const out = await stateForKeys(
    h.registry, h.subscriptions, PRINCIPAL, [parseStateKey('demos/notes')], idMap);
  expect(out.sharedComponent).toEqual({ 'demos/notes': { notes: 'cat notes' } });
});

test('a scoped key resolves grouping via its LEAF definition', async () => {
  const h = harness();
  const idMap = {
    'demos/notes': { v1: { tag: 'SharedNotes', attributes: { 'grouped-by': 'topic.value' } } },
  };
  await h.store(OWN, 'demos/topic', { value: 'Dogs' });
  await h.store(setInstance('topic.value', 'Dogs'), 'demos/list:#2:notes', { notes: 'dog notes' });

  const out = await stateForKeys(
    h.registry, h.subscriptions, PRINCIPAL, [parseStateKey('demos/list:#2:notes')], idMap);
  expect(out.sharedComponent).toEqual({ 'demos/list:#2:notes': { notes: 'dog notes' } });
});

test('the state fetch is a subscription (pending until the socket arrives)', async () => {
  const h = harness();
  const key = parseStateKey('demos/poll');
  await stateForKeys(h.registry, h.subscriptions, PRINCIPAL, [key], {});

  // No socket was open during the fetch; the arriving connection adopts.
  const ws = {} as any;
  h.subscriptions.adoptPending(PRINCIPAL, ws);
  expect(h.subscriptions.subscribers(subscriptionKey(ALL, key)).has(ws)).toBe(true);
});

test('a key with both own and shared state appears in both maps', async () => {
  const h = harness();
  await h.store(OWN, 'demos/quiz', { answer: 'mine' });
  await h.store(ALL, 'demos/quiz', { distribution: { a: 3 } });
  const out = await stateForKeys(
    h.registry, h.subscriptions, PRINCIPAL, [parseStateKey('demos/quiz')], {});
  expect(out.component).toEqual({ 'demos/quiz': { answer: 'mine' } });
  expect(out.sharedComponent).toEqual({ 'demos/quiz': { distribution: { a: 3 } } });
  expect(out.absent).toEqual([]);
});
