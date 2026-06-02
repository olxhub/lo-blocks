// Key-value store abstraction — the persistence layer.
//
// Values are strings (JSON-serialized by the caller). The KVS doesn't parse
// or interpret values — it's a byte store. Keys are scoped by the caller
// (e.g. `blob:${safe_user_id}`, `field:${user}:${scope}:${name}`).
//
// Four backends:
//   MemoryKVStore — dev/tests only, data lost on restart
//   FileKVStore   — directory-based persistence, one file per key
//   ValkeyKVStore — production (ElastiCache/Valkey/Redis/MemoryDB)
//   PrefixedKVStore — decorator that namespaces keys for multi-tenancy

import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import Redis, { type RedisOptions } from 'ioredis';
import type { KVSKey } from '@/lib/types/identity';

// Re-export for callers that need the key type alongside the store.
const asKVSKey = (s: string) => s as KVSKey;

/** Check that a resolved path is within the given root directory. */
function isPathAllowed(resolved: string, root: string): boolean {
  const rel = path.relative(root, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export interface KVStore {
  get(key: KVSKey): Promise<string | null>;
  set(key: KVSKey, value: string): Promise<void>;
  del(key: KVSKey): Promise<void>;
  close?(): Promise<void>;
}

/**
 * In-memory KVS backed by a Map. Data is lost on server restart.
 * Good for tests; not for anything you care about keeping.
 */
export class MemoryKVStore implements KVStore {
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

/**
 * Directory-based file KVS. Each key maps to a file on disk, using `:`
 * as the directory separator:
 *
 *   blob:guest-User42           → <root>/blob/guest-User42
 *   rate:guest-User42:rpm       → <root>/rate/guest-User42/rpm
 *   field:guest-User42:comp:cnt → <root>/field/guest-User42/comp/cnt
 *
 * Individual writes are atomic (tmp + rename), but concurrent writes to
 * the SAME key have non-deterministic ordering — last rename wins, which
 * may not match call order. Fine for local dev; use ValkeyKVStore in
 * production for atomic ops and deterministic ordering.
 *
 * Usage:
 *   new FileKVStore()               // default: ./data/kvs
 *   new FileKVStore('./my/store')
 */
export class FileKVStore implements KVStore {
  private root: string;

  constructor(root = './data/kvs') {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }

  /** Convert a KVS key to a file path under the root directory. */
  private keyToPath(key: KVSKey): string {
    const resolved = path.resolve(this.root, ...(key as string).split(':'));
    if (!isPathAllowed(resolved, this.root)) {
      throw new Error(`[KVS] Key escapes store root: "${key}"`);
    }
    return resolved;
  }

  async get(key: KVSKey) {
    try {
      return await fsp.readFile(this.keyToPath(key), 'utf-8');
    } catch {
      return null;
    }
  }

  async set(key: KVSKey, value: string) {
    const filePath = this.keyToPath(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = filePath + `.tmp.${crypto.randomBytes(6).toString('hex')}`;
    await fsp.writeFile(tmp, value);
    await fsp.rename(tmp, filePath);
  }

  async del(key: KVSKey) {
    try {
      await fsp.unlink(this.keyToPath(key));
    } catch {
      // Key didn't exist — that's fine.
    }
  }
}

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
  constructor(private inner: KVStore, private prefix: string) {}

  private prefixed(key: KVSKey): KVSKey {
    return asKVSKey(`${this.prefix}:${key}`);
  }

  async get(key: KVSKey) {
    return this.inner.get(this.prefixed(key));
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
  private client: Redis;

  constructor(opts?: string | RedisOptions) {
    this.client = typeof opts === 'string'
      ? new Redis(opts)
      : new Redis(opts ?? {});
  }

  async get(key: KVSKey) {
    return await this.client.get(key);
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
