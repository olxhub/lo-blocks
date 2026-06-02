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
 * Writes are atomic (tmp + rename). Each key is independent — no race
 * conditions between concurrent writes to different keys.
 *
 * On construction, auto-migrates from the legacy single-file format
 * (data/kvs.json) if found.
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
    this.migrateFromLegacy();
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
    const tmp = filePath + '.tmp';
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

  /**
   * Auto-migrate from the legacy single-JSON-file format.
   *
   * If data/kvs.json exists next to the store root, read it, write each
   * key-value pair into the directory structure, and rename the old file
   * so migration doesn't run again.
   */
  private migrateFromLegacy() {
    const legacyPath = path.join(path.dirname(this.root), 'kvs.json');
    let raw: string;
    try {
      raw = fs.readFileSync(legacyPath, 'utf-8');
    } catch {
      return; // No legacy file — nothing to migrate.
    }

    let data: Record<string, string>;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error(`[KVS] Legacy kvs.json is corrupt, skipping migration: ${err}`);
      return;
    }

    const keys = Object.keys(data);
    if (keys.length === 0) {
      // Empty store — just remove the legacy file.
      fs.renameSync(legacyPath, legacyPath + '.migrated');
      return;
    }

    console.log(`[KVS] Migrating ${keys.length} key(s) from legacy kvs.json...`);
    for (const key of keys) {
      const filePath = this.keyToPath(asKVSKey(key));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, data[key]);
    }
    fs.renameSync(legacyPath, legacyPath + '.migrated');
    console.log(`[KVS] Migration complete. Old file renamed to kvs.json.migrated`);
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
