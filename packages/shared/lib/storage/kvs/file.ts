// packages/shared/lib/storage/kvs/file.ts
//
// Directory-based file KVS backend. Node-only (fs, crypto, path) — reached
// only by explicit path import (@/lib/storage/kvs/file), never re-exported
// from the browser-safe kvs/index.ts.

import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import type { KVSKey } from '@/lib/types/identity';
import type { KVStore } from '@/lib/storage/kvs';

/** Check that a resolved path is within the given root directory. */
function isPathAllowed(resolved: string, root: string): boolean {
  const rel = path.relative(root, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
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
