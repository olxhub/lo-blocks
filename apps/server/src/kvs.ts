// Key-value store abstraction — the persistence layer.
//
// Values are strings (JSON-serialized by the caller). The KVS doesn't parse
// or interpret values — it's a byte store. Keys are scoped by the caller
// (e.g. `blob:${safe_user_id}:${activity}`, `field:${user}:${scope}:${name}`).
//
// TODO: Backend selection should come from PMSS config rather than being
// hard-coded here. Until then, MemoryKVStore is the default.

export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  // Future: multiGet, multiSet
}

/**
 * In-memory KVS backed by a Map. Data is lost on server restart.
 * Good for dev; production should use Valkey/Redis or SQLite.
 */
export class MemoryKVStore implements KVStore {
  private data = new Map<string, string>();

  async get(key: string) {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.data.set(key, value);
  }

  async del(key: string) {
    this.data.delete(key);
  }
}

// TODO: SQLiteKVStore — `better-sqlite3`, single table (key TEXT PRIMARY KEY, value TEXT).
//   For local persistence without a server process. Sync API wrapped in async.
//
// TODO: ValkeyKVStore — `ioredis` or `redis` client. For production
//   (ElastiCache/Valkey/Redis). Native async.
