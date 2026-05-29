// Key-value store abstraction — the persistence layer.
//
// Values are strings (JSON-serialized by the caller). The KVS doesn't parse
// or interpret values — it's a byte store. Keys are scoped by the caller
// (e.g. `blob:${safe_user_id}:${activity}`, `field:${user}:${scope}:${name}`).
//
// Three backends:
//   MemoryKVStore — dev/tests only, data lost on restart
//   FileKVStore   — single-server persistence, zero dependencies
//   ValkeyKVStore — production (ElastiCache/Valkey/Redis)

import fs from 'fs';
import path from 'path';
import Redis, { type RedisOptions } from 'ioredis';
import type { KVSKey } from '@/lib/types/identity';

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
 * File-backed KVS. Reads a JSON object from disk on startup, writes
 * atomically (tmp + rename) on every mutation. Zero dependencies.
 *
 * Good for single-server deploys at classroom scale. The entire store
 * lives in memory for fast reads; writes go to disk immediately.
 *
 * Usage:
 *   new FileKVStore()                  // default: ./data/kvs.json
 *   new FileKVStore('./my/path.json')
 */
export class FileKVStore implements KVStore {
  private data: Record<string, string>;
  private filePath: string;

  constructor(filePath = './data/kvs.json') {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.data = this.load();
  }

  private load(): Record<string, string> {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch {
      // File doesn't exist yet — start with empty store
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      // Parse failed — back up the corrupt file so data isn't lost,
      // then start fresh.
      const backup = `${this.filePath}.corrupt.${Date.now()}`;
      console.error(
        `[KVS] Failed to parse ${this.filePath}: ${err}. ` +
        `Backing up to ${backup}`
      );
      try {
        fs.copyFileSync(this.filePath, backup);
      } catch (backupErr) {
        console.error(`[KVS] Could not create backup at ${backup}:`, backupErr);
      }
      return {};
    }
  }

  // TODO: persist() does synchronous I/O of the entire store on every
  // set()/del(). This blocks the event loop and is O(n) in total stored
  // data. Fine at classroom scale, but for larger deployments switch to
  // debounced/batched async writes (or use ValkeyKVStore).
  private persist() {
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.filePath);
  }

  async get(key: KVSKey) {
    return this.data[key] ?? null;
  }

  async set(key: KVSKey, value: string) {
    this.data[key] = value;
    this.persist();
  }

  async del(key: KVSKey) {
    delete this.data[key];
    this.persist();
  }
}

/**
 * Valkey/Redis-backed KVS. For production — ElastiCache, managed Redis, etc.
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
