// Key-value store abstraction — the persistence layer.
//
// Values are strings (JSON-serialized by the caller). The KVS doesn't parse
// or interpret values — it's a byte store. Keys are scoped by the caller
// (e.g. `blob:${safe_user_id}`, `field:${user}:${scope}:${name}`).
//
// Five backends:
//   MemoryKVStore   — dev/tests only, data lost on restart
//   FileKVStore     — directory-based persistence, one file per key
//   PostgresKVStore — production (RDS, Aurora Serverless, or local PostgreSQL)
//   ValkeyKVStore   — production (ElastiCache/Valkey/Redis/MemoryDB)
//   PrefixedKVStore — decorator that namespaces keys for multi-tenancy

import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import Redis, { type RedisOptions } from 'ioredis';
import pg from 'pg';
import type { KVSKey } from '@/lib/types/identity';

// Re-export for callers that need the key type alongside the store.
const asKVSKey = (s: string) => s as KVSKey;

/** Check that a resolved path is within the given root directory. */
function isPathAllowed(resolved: string, root: string): boolean {
  const rel = path.relative(root, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

// The interface (and MemoryKVStore) live in the shared library — the
// state-sync engine (lib/state/sync) writes through them; this file is
// the deployment half: backends with real dependencies.
export { MemoryKVStore, getMany, type KVStore } from '@/lib/storage/kvs';
import { getMany, type KVStore } from '@/lib/storage/kvs';

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
  ready = Promise.resolve();
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

  async getMany(keys: KVSKey[]) {
    return Promise.all(keys.map((key) => this.get(key)));
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

/**
 * PostgreSQL-backed KVS. For production — Aurora Serverless, RDS, or local
 * PostgreSQL. Uses a single table with (key TEXT PRIMARY KEY, value TEXT).
 *
 * Auto-creates the table on first connection if it doesn't exist.
 *
 * Usage:
 *   new PostgresKVStore('postgresql://user:pass@host:5432/dbname')
 *   new PostgresKVStore({ host: '...', database: 'lo', ssl: true })
 */
export class PostgresKVStore implements KVStore {
  private pool: pg.Pool;
  private table: string;
  ready: Promise<void>;

  constructor(opts?: string | pg.PoolConfig, table = 'kvs') {
    this.table = table;
    this.pool = typeof opts === 'string'
      ? new pg.Pool({ connectionString: opts })
      : new pg.Pool(opts);
    this.ready = this.ensureTable();
  }

  private async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        key   TEXT PRIMARY KEY,
        value JSONB NOT NULL
      )
    `);
  }

  async get(key: KVSKey) {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT value FROM ${this.table} WHERE key = $1`,
      [key],
    );
    if (!rows[0]) return null;
    // JSONB round-trips through parsed JSON; serialize back to string
    // to match the KVStore interface contract.
    return JSON.stringify(rows[0].value);
  }

  async getMany(keys: KVSKey[]) {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT key, value FROM ${this.table} WHERE key = ANY($1)`,
      [keys],
    );
    const byKey = new Map<string, string>(
      rows.map((r: { key: string; value: unknown }) => [r.key, JSON.stringify(r.value)]),
    );
    return keys.map((key) => byKey.get(key) ?? null);
  }

  async set(key: KVSKey, value: string) {
    await this.ready;
    await this.pool.query(
      `INSERT INTO ${this.table} (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }

  async del(key: KVSKey) {
    await this.ready;
    await this.pool.query(
      `DELETE FROM ${this.table} WHERE key = $1`,
      [key],
    );
  }

  async close() {
    await this.pool.end();
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
