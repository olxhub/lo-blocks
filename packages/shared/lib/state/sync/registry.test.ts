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

test('a live, seeded materialization is authoritative over storage', async () => {
  const kvs = new MemoryKVStore();
  await storeBucket(kvs, 'poll1', { votes: 3 });
  const registry = new UserStateRegistry(kvs);

  const entry = registry.acquire(ALL);
  await entry.ensureSeeded(async () => {
    entry.serverState.seed({ component: { poll1: { votes: 3 } } });
  });
  // Storage moves on (e.g. another flush cycle wrote something stale-r):
  // the live entry, not storage, is the instance's authority.
  await storeBucket(kvs, 'poll1', { votes: -1 });

  const buckets = await registry.readBuckets(ALL, ['poll1']);
  expect(buckets).toEqual({ poll1: { votes: 3 } });
  await entry.release();
});

test('an unseeded live entry overlays its buckets on stored ones', async () => {
  const kvs = new MemoryKVStore();
  await storeBucket(kvs, 'poll1', { votes: 3 });
  await storeBucket(kvs, 'poll2', { votes: 7 });
  const registry = new UserStateRegistry(kvs);

  // Acquired but never seeded (no connection load ran): its
  // materialization holds only this session's events — here, none for
  // poll1, so storage shows through; a live bucket would win wholesale.
  const entry = registry.acquire(ALL);
  const buckets = await registry.readBuckets(ALL, ['poll1', 'poll2']);
  expect(buckets).toEqual({ poll1: { votes: 3 }, poll2: { votes: 7 } });
  await entry.release();
});
