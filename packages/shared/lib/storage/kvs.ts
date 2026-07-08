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
  set(key: KVSKey, value: string): Promise<void>;
  del(key: KVSKey): Promise<void>;
  close?(): Promise<void>;
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

  async set(key: KVSKey, value: string) {
    this.data.set(key, value);
  }

  async del(key: KVSKey) {
    this.data.delete(key);
  }
}
