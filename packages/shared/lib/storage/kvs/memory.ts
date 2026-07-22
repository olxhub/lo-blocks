// packages/shared/lib/storage/kvs/memory.ts
//
// The dependency-free KVS backend. Lives in the shared library (not with
// the node backends) because the library's own tests need a store with no
// dependencies at all; the browser-safe kvs/index.ts re-exports it.

import type { KVSKey } from '@/lib/types/identity';
import type { KVStore } from '@/lib/storage/kvs';

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
