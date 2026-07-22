// packages/shared/lib/storage/kvs/valkey.ts
//
// Valkey/Redis-backed KVS backend. Depends on `ioredis` — reached only by
// explicit path import (@/lib/storage/kvs/valkey), never re-exported from
// the browser-safe kvs/index.ts.

import Redis, { type RedisOptions } from 'ioredis';
import type { KVSKey } from '@/lib/types/identity';
import type { KVStore } from '@/lib/storage/kvs';

/**
 * Valkey/Redis-backed KVS. For production — ElastiCache, Valkey, Redis,
 * or AWS MemoryDB (Valkey-compatible).
 *
 * Usage:
 *   new ValkeyKVStore()                              // localhost:6379
 *   new ValkeyKVStore('redis://user:pass@host:6379')
 *   new ValkeyKVStore({ host: '...', port: 6379 })
 */
export class ValkeyKVStore implements KVStore {
  ready = Promise.resolve();
  private client: Redis;

  constructor(opts?: string | RedisOptions) {
    this.client = typeof opts === 'string'
      ? new Redis(opts)
      : new Redis(opts ?? {});
  }

  async get(key: KVSKey) {
    return await this.client.get(key);
  }

  async getMany(keys: KVSKey[]) {
    // MGET is one round trip and already returns null per miss, in order.
    return await this.client.mget(keys as string[]);
  }

  async set(key: KVSKey, value: string) {
    await this.client.set(key, value);
  }

  async del(key: KVSKey) {
    await this.client.del(key);
  }

  async close() {
    await this.client.quit();
  }
}
