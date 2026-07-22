// @vitest-environment node
// packages/shared/lib/storage/kvs.test.ts
//
// getMany: the batched-read seam. Backends with a native batch op
// implement KVStore.getMany; everyone else gets concurrent get()s via
// the helper. Callers rely on order preservation and null-per-miss.

import { test, expect } from 'vitest';
import { MemoryKVStore, getMany, type KVStore } from './kvs';
import type { KVSKey } from '@/lib/types/identity';

const k = (s: string) => s as KVSKey;

test('getMany returns values in key order with null per miss', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(k('a'), '1');
  await kvs.set(k('c'), '3');
  expect(await getMany(kvs, [k('a'), k('b'), k('c')])).toEqual(['1', null, '3']);
});

test('getMany on empty keys never touches the store', async () => {
  const kvs: KVStore = {
    ready: Promise.resolve(),
    get: async () => { throw new Error('should not be called'); },
    set: async () => {},
    del: async () => {},
  };
  expect(await getMany(kvs, [])).toEqual([]);
});

test('getMany falls back to concurrent get()s when the backend has none', async () => {
  // A minimal store WITHOUT getMany — like the test fakes wrapping
  // MemoryKVStore, or a future backend that never implements batching.
  const data = new Map<string, string>([['x', 'vx'], ['z', 'vz']]);
  let gets = 0;
  const kvs: KVStore = {
    ready: Promise.resolve(),
    get: async (key) => { gets++; return data.get(key as string) ?? null; },
    set: async () => {},
    del: async () => {},
  };
  expect(await getMany(kvs, [k('x'), k('y'), k('z')])).toEqual(['vx', null, 'vz']);
  expect(gets).toBe(3);
});

test('getMany prefers the native implementation', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(k('a'), '1');
  let nativeCalls = 0;
  const spied: KVStore = {
    ready: kvs.ready,
    get: async () => { throw new Error('helper must use native getMany'); },
    getMany: (keys) => { nativeCalls++; return kvs.getMany(keys); },
    set: (key, value) => kvs.set(key, value),
    del: (key) => kvs.del(key),
  };
  expect(await getMany(spied, [k('a'), k('b')])).toEqual(['1', null]);
  expect(nativeCalls).toBe(1);
});

test('duplicate keys each get their value (Postgres-map semantics)', async () => {
  // PostgresKVStore builds a key→value map from `= ANY` rows and maps the
  // input keys over it — duplicates must not collapse or shift order.
  const kvs = new MemoryKVStore();
  await kvs.set(k('a'), '1');
  expect(await getMany(kvs, [k('a'), k('a'), k('b')])).toEqual(['1', '1', null]);
});
