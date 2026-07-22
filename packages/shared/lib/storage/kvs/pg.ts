// packages/shared/lib/storage/kvs/pg.ts
//
// PostgreSQL-backed KVS backend. Depends on `pg` — reached only by explicit
// path import (@/lib/storage/kvs/pg), never re-exported from the
// browser-safe kvs/index.ts.

import pg from 'pg';
import type { KVSKey } from '@/lib/types/identity';
import type { KVStore } from '@/lib/storage/kvs';

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
    // One round trip for the whole batch. Rows come back unordered, so map
    // them by key and read back in request order (null per miss); a
    // duplicate key resolves to the same value for each occurrence.
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
