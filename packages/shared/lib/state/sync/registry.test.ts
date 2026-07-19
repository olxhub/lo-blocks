// @vitest-environment node
// packages/shared/lib/state/sync/registry.test.ts
//
// readBuckets: the id-scoped read. Shared buckets are stored under plain
// block ids, so a page's worth of `all` state is one batched lookup —
// never an assembly of the whole instance (which scaled with total
// deployment state, found by review 2026-07).

import { test, expect } from 'vitest';
import { MemoryKVStore } from '@/lib/storage/kvs';
import { UserStateRegistry } from './registry';
import { kvsKey } from '@/lib/types/identity';
import { ALL } from './levels';

function storeBucket(kvs: MemoryKVStore, id: string, bucket: Record<string, any>) {
  return kvs.set(kvsKey.field(ALL, 'component', id), JSON.stringify(bucket));
}

test('cold path: requested buckets come straight from storage, misses absent', async () => {
  const kvs = new MemoryKVStore();
  await storeBucket(kvs, 'poll1', { votes: 3 });
  await storeBucket(kvs, 'elsewhere', { votes: 99 });
  const registry = new UserStateRegistry(kvs);

  const buckets = await registry.readBuckets(ALL, ['poll1', 'never-seen']);
  expect(buckets).toEqual({ poll1: { votes: 3 } });
});

test('empty id list reads nothing', async () => {
  const registry = new UserStateRegistry(new MemoryKVStore());
  expect(await registry.readBuckets(ALL, [])).toEqual({});
});

test('a RESIDENT bucket is authoritative over storage', async () => {
  const kvs = new MemoryKVStore();
  await storeBucket(kvs, 'poll1', { votes: 3 });
  const registry = new UserStateRegistry(kvs);

  // Making the bucket resident adopts its stored value into the
  // materialization — from here the live entry, not storage, is authority.
  const entry = registry.acquire(ALL);
  await entry.ensureBucketLoaded('poll1');
  // Storage moves on (another flush cycle wrote something stale-r).
  await storeBucket(kvs, 'poll1', { votes: -1 });

  const buckets = await registry.readBuckets(ALL, ['poll1']);
  expect(buckets).toEqual({ poll1: { votes: 3 } });
  await entry.release();
});

test('a non-resident bucket reads straight from storage', async () => {
  const kvs = new MemoryKVStore();
  await storeBucket(kvs, 'poll1', { votes: 3 });
  await storeBucket(kvs, 'poll2', { votes: 7 });
  const registry = new UserStateRegistry(kvs);

  // Acquired but no bucket loaded: nothing resident, so storage shows
  // through (and readBuckets warms the entry with what it read).
  const entry = registry.acquire(ALL);
  const buckets = await registry.readBuckets(ALL, ['poll1', 'poll2']);
  expect(buckets).toEqual({ poll1: { votes: 3 }, poll2: { votes: 7 } });
  await entry.release();
});

test('a bucket that turns RESIDENT during the storage read answers with its live value', async () => {
  // The race (found by review 2026-07): readBuckets partitions a bucket
  // as cold and awaits storage; meanwhile an event's dispatch gate makes
  // the bucket resident and folds. The response must carry the LIVE fold
  // — the client's sharedComponent adoption is server-wins, so a stale
  // late response would overwrite the newer socket patch.
  const kvs = new MemoryKVStore();
  await storeBucket(kvs, 'poll1', { value: 'stored' });

  // Hold getMany (the cold-read path) open; get() — the gate's read —
  // stays fast, so the gate can win the race mid-await.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const baseGetMany = kvs.getMany.bind(kvs);
  kvs.getMany = async (keys) => { await gate; return baseGetMany(keys); };

  const registry = new UserStateRegistry(kvs);
  const entry = registry.acquire(ALL);

  const pending = registry.readBuckets(ALL, ['poll1']);
  await entry.ensureBucketLoaded('poll1'); // the gate wins the race
  entry.serverState.dispatch({
    event: 'UPDATE_VALUE', field: 'value', scope: 'component',
    id: 'poll1', value: 'live fold', ts: 1, actor: 'x',
  });
  release();

  const buckets = await pending;
  expect(buckets.poll1.value).toBe('live fold');
  await entry.release();
});

test('ROGUE REDUCER: an ungated fold warns loudly and the repair keeps stored fields', async () => {
  // INV-1 rests on "an event with an id writes only component[event.id]".
  // If a reducer instead dirties some OTHER, never-gated bucket, the
  // backstop must fire (loud contract-check) and repair merges the stored
  // copy under the live fold so nothing on disk is clobbered.
  const kvs = new MemoryKVStore();
  await storeBucket(kvs, 'rogue', { keep: 'stored', value: 'old' });
  const registry = new UserStateRegistry(kvs);
  const entry = registry.acquire(ALL);

  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
  try {
    // Bypass routeEvent's gate: dispatch straight into the materialization,
    // then run the diff — 'rogue' was never made resident.
    entry.serverState.dispatch({
      event: 'UPDATE_VALUE', field: 'value', scope: 'component',
      id: 'rogue', value: 'new', ts: 1, actor: 'x',
    });
    entry.persister.stateChanged(entry.serverState.state);
    await new Promise((r) => setTimeout(r, 10)); // let the async repair run
  } finally { console.warn = orig; }

  expect(warns.some((w) => w.includes('INV-1 VIOLATION') && w.includes('rogue'))).toBe(true);
  const buckets = await registry.readBuckets(ALL, ['rogue']);
  expect(buckets.rogue.keep).toBe('stored'); // stored field preserved by the repair
  expect(buckets.rogue.value).toBe('new');   // live fold still applied
  await entry.release();
});
