// packages/shared/lib/storage/kvs.ts
//
// The key-value store INTERFACE — the persistence seam the state-sync
// library (lib/state/sync) writes through. Values are strings
// (JSON-serialized by the caller); keys are namespaced by the builder
// functions in lib/types/identity (kvsKey.*). The store assumes no
// enumeration, queries, or schema — whether richer backends (Postgres
// JSON queries) get used directly is deliberately undecided
// (docs/architecture.md §2.7).
//
// Backends live where their dependencies do: apps/server/src/kvs.ts
// implements this interface with file/Postgres/Valkey stores (node, pg,
// ioredis — deployment concerns). MemoryKVStore lives here because the
// library's own tests need a store with no dependencies at all.

import type { KVSKey } from '@/lib/types/identity';

export interface KVStore {
  ready: Promise<void>;
  get(key: KVSKey): Promise<string | null>;
  /** Batched point reads, same order as `keys` (null per miss). Optional:
   * backends with a native batch op (Valkey MGET, Postgres `= ANY`)
   * implement it; callers go through getMany() below, which falls back
   * to concurrent get()s. Still a dumb byte store — this batches point
   * reads, it is not enumeration. */
  getMany?(keys: KVSKey[]): Promise<(string | null)[]>;
  set(key: KVSKey, value: string): Promise<void>;
  del(key: KVSKey): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Batched read through any KVStore: the backend's native getMany when it
 * has one, else concurrent get()s (one round trip per key, but in
 * flight together — never the sequential await-per-key loop that made
 * page loads O(buckets) round trips).
 */
export function getMany(store: KVStore, keys: KVSKey[]): Promise<(string | null)[]> {
  if (keys.length === 0) return Promise.resolve([]);
  if (store.getMany) return store.getMany(keys);
  return Promise.all(keys.map((key) => store.get(key)));
}

/**
 * In-memory KVS backed by a Map. Data is lost on restart.
 * Good for tests; not for anything you care about keeping.
 */
export class MemoryKVStore implements KVStore {
  ready = Promise.resolve();
  private data = new Map<KVSKey, string>();

  async get(key: KVSKey) {
    return this.data.get(key) ?? null;
  }

  async getMany(keys: KVSKey[]) {
    return keys.map((key) => this.data.get(key) ?? null);
  }

  async set(key: KVSKey, value: string) {
    this.data.set(key, value);
  }

  async del(key: KVSKey) {
    this.data.delete(key);
  }
}
