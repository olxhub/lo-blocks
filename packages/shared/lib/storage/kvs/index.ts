// packages/shared/lib/storage/kvs/index.ts
//
// The key-value store INTERFACE — the persistence seam the state-sync
// library (lib/state/sync) writes through. Values are strings
// (JSON-serialized by the caller); keys are namespaced by the builder
// functions in lib/types/identity (kvsKey.*). The store assumes no
// enumeration, queries, or schema — whether richer backends (Postgres
// JSON queries) get used directly is deliberately undecided
// (docs/architecture.md §2.7).
//
// This is the browser-safe entrypoint: only the interface, the getMany
// helper, and MemoryKVStore (zero dependencies) live/re-export here.
// Backends live where their dependencies do — the sibling files
// kvs/file.ts, kvs/pg.ts, kvs/valkey.ts, kvs/prefixed.ts implement this
// interface with file/Postgres/Valkey stores (node, pg, ioredis —
// deployment concerns) and are reached ONLY by explicit path import, so
// their heavy deps never leak into the client bundle. MemoryKVStore is
// re-exported here because the library's own tests need a store with no
// dependencies at all.

import type { KVSKey } from '@/lib/types/identity';

export { MemoryKVStore } from './memory';

export interface KVStore {
  ready: Promise<void>;
  get(key: KVSKey): Promise<string | null>;
  /** Batched point reads, same order as `keys`, null per miss. Implement
   * ONLY when the backend has a native batch (Valkey MGET, Postgres
   * `= ANY`); everyone else is served by the getMany() helper below,
   * which falls back to concurrent get()s. Callers ALWAYS go through that
   * helper, never this method directly. Still a dumb byte store — this
   * batches point reads, it is not enumeration. */
  getMany?(keys: KVSKey[]): Promise<(string | null)[]>;
  set(key: KVSKey, value: string): Promise<void>;
  del(key: KVSKey): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Batched read through any KVStore: the backend's native getMany when it
 * has one, else concurrent get()s — one round trip per key, but in flight
 * together, never a sequential await-per-key loop. This helper is the seam
 * callers use; a backend without a native batch simply omits getMany.
 */
export function getMany(store: KVStore, keys: KVSKey[]): Promise<(string | null)[]> {
  if (keys.length === 0) return Promise.resolve([]);
  if (store.getMany) return store.getMany(keys);
  return Promise.all(keys.map((key) => store.get(key)));
}
