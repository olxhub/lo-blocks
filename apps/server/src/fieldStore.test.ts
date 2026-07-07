// @vitest-environment node
// apps/server/src/fieldStore.test.ts
//
// FieldPersister unit tests: identity-diff dirty tracking, debounced
// flush, index maintenance, rebase (seed adoption), assembly round-trip,
// and the parallel-run comparison instrument.

import { test, expect } from 'vitest';
import { MemoryKVStore, type KVStore } from './kvs.js';
import { FieldPersister, assembleFieldState, compareToBlob } from './fieldStore.js';
import { kvsKey, type SafeUserId } from '@/lib/types/identity';
import type { KVSKey } from '@/lib/types/identity';

const USER = 'test-user' as SafeUserId;

/** KVS wrapper that counts set() calls per key. */
class CountingKVS implements KVStore {
  ready = Promise.resolve();
  sets: string[] = [];
  constructor(private inner: KVStore = new MemoryKVStore()) {}
  get(key: KVSKey) { return this.inner.get(key); }
  set(key: KVSKey, value: string) { this.sets.push(key); return this.inner.set(key, value); }
  del(key: KVSKey) { return this.inner.del(key); }
}

const state1 = {
  system: { locale: 'en' },
  component: { block1: { value: 'a' }, block2: { value: 'b' } },
  componentSetting: { Tabs: { open: 1 } },
};

test('persists dirty buckets and maintains the index', async () => {
  const kvs = new CountingKVS();
  const p = new FieldPersister(kvs, USER, 0);

  p.stateChanged(state1);
  await p.close();

  expect(await kvs.get(kvsKey.field(USER, 'component', 'block1'))).toBe(
    JSON.stringify({ value: 'a' }));
  expect(await kvs.get(kvsKey.field(USER, 'system', '_'))).toBe(
    JSON.stringify({ locale: 'en' }));
  const index = JSON.parse((await kvs.get(kvsKey.fieldIndex(USER)))!);
  expect(index.component.sort()).toEqual(['block1', 'block2']);
  expect(index.system).toEqual(['_']);
  expect(index.componentSetting).toEqual(['Tabs']);
});

test('identity diff: only the changed bucket is rewritten', async () => {
  const kvs = new CountingKVS();
  const p = new FieldPersister(kvs, USER, 0);
  p.stateChanged(state1);
  await p.close();
  kvs.sets = [];

  // Reducer-style immutable update: new component map, ONE new bucket,
  // block2 and system keep their references.
  const state2 = {
    ...state1,
    component: { ...state1.component, block1: { value: 'a2' } },
  };
  p.stateChanged(state2);
  await p.close();

  expect(kvs.sets).toEqual([kvsKey.field(USER, 'component', 'block1')]);
  expect(await kvs.get(kvsKey.field(USER, 'component', 'block1'))).toBe(
    JSON.stringify({ value: 'a2' }));
});

test('rebase adopts a snapshot without writing it', async () => {
  const kvs = new CountingKVS();
  const p = new FieldPersister(kvs, USER, 0);
  p.startFromPersisted(state1);
  p.stateChanged(state1);
  await p.close();
  expect(kvs.sets).toEqual([]);
});

test('assembleFieldState round-trips what the persister wrote', async () => {
  const kvs = new MemoryKVStore();
  const p = new FieldPersister(kvs, USER, 0);
  p.stateChanged(state1);
  await p.close();

  const assembled = await assembleFieldState(kvs, USER);
  expect(assembled).toEqual(state1);
});

test('bucket ids with /, #, :, spaces survive the KVS round trip', async () => {
  // Real OLX ids look like 'edu.memphis.psych/operant_mastery/#attempt_0' —
  // unencoded, FileKVStore exploded these into directory trees (ENOTDIR,
  // 2026-07-07). kvsKey.field percent-encodes the bucket name.
  const kvs = new MemoryKVStore();
  const p = new FieldPersister(kvs, USER, 0);
  const uglyId = 'edu.memphis.psych/operant_mastery/#attempt 0:v2';
  p.stateChanged({ system: {}, component: { [uglyId]: { value: 'survived' } }, componentSetting: {} });
  await p.close();

  const assembled = await assembleFieldState(kvs, USER);
  expect(assembled!.component![uglyId].value).toBe('survived');
  expect(kvsKey.field(USER, 'component', uglyId)).not.toContain('/');
  expect(kvsKey.field(USER, 'component', uglyId)).not.toContain('#');
});

test('assembleFieldState returns null for unknown users', async () => {
  expect(await assembleFieldState(new MemoryKVStore(), USER)).toBeNull();
});

test('compareToBlob counts agreement, insensitive to key order', () => {
  const server = { system: { a: 1, b: 2 }, component: { x: { p: 1, q: 2 } }, componentSetting: {} };
  const blob = { system: { b: 2, a: 1 }, component: { x: { q: 2, p: 1 }, y: { r: 3 } }, componentSetting: {} };
  const summary = compareToBlob(server, blob);
  expect(summary).toContain('system: 1=, 0≠');
  expect(summary).toContain('component: 1=, 0≠, 0 server-only, 1 blob-only');
});

test('compareToBlob flags real divergence', () => {
  const server = { system: {}, component: { x: { v: 1 } }, componentSetting: {} };
  const blob = { system: {}, component: { x: { v: 2 } }, componentSetting: {} };
  expect(compareToBlob(server, blob)).toContain('component: 0=, 1≠');
});
