// packages/shared/lib/storage/kvs/prefixed.ts
//
// Multi-tenancy decorator that namespaces keys before delegating to an
// inner backend. Reached only by explicit path import
// (@/lib/storage/kvs/prefixed).

import type { KVSKey } from '@/lib/types/identity';
import { getMany, type KVStore } from '@/lib/storage/kvs';

const asKVSKey = (s: string) => s as KVSKey;

/**
 * Transparent key-prefix wrapper for multi-tenancy.
 *
 * Prepends a deploy prefix to every key before passing to the inner store.
 * Callers are unaware of the prefix — different deploys sharing a backend
 * get isolated key namespaces.
 *
 * Usage:
 *   new PrefixedKVStore(innerStore, 'psych-pilot')
 *   // key "blob:user42" becomes "psych-pilot:blob:user42" in the inner store
 */
export class PrefixedKVStore implements KVStore {
  ready: Promise<void>;
  constructor(private inner: KVStore, private prefix: string) {
    this.ready = inner.ready;
  }

  private prefixed(key: KVSKey): KVSKey {
    return asKVSKey(`${this.prefix}:${key}`);
  }

  async get(key: KVSKey) {
    return this.inner.get(this.prefixed(key));
  }

  async getMany(keys: KVSKey[]) {
    // Prefix, then delegate to the inner store's batch (via the helper, so
    // the inner store's native getMany is used when it has one).
    return getMany(this.inner, keys.map((key) => this.prefixed(key)));
  }

  async set(key: KVSKey, value: string) {
    return this.inner.set(this.prefixed(key), value);
  }

  async del(key: KVSKey) {
    return this.inner.del(this.prefixed(key));
  }

  async close() {
    return this.inner.close?.();
  }
}
