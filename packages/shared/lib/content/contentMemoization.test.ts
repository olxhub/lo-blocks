// @vitest-environment node
//
// The content index as a memoization of storage, WITH a warm parse cache
// (KVS set). Two invariants the pure-memoization rewrite has to hold:
//   1. an aux-file edit forces its dependents to re-parse (cache MISS) even
//      though their own bytes — and therefore the cache key — never changed;
//   2. a rebuild triggered by an UNRELATED source re-parses nothing whose bytes
//      and dependencies are unchanged (everything else is a cache hit).

import { afterEach, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

import { FileStorageProvider } from '../lofs/providers/file';
import { InMemoryStorageProvider } from '../lofs/providers/memory';
import { syncContentFromStorage, syncContentUnion } from './syncContentFromStorage';
import { setParseCacheKvs, resetParseCacheStats, parseCacheStats } from './parseCache';
import { MemoryKVStore } from '@/lib/storage/kvs';
import { getOlxJson } from '../test-utils';

afterEach(() => {
  setParseCacheKvs(null);
  resetParseCacheStats();
});

it('re-parses a dependent from a cache MISS when its aux file changes (warm KVS)', async () => {
  setParseCacheKvs(new MemoryKVStore());

  // A temp dir INSIDE content/ so it clears the file provider's security check.
  const tmpDir = path.join(process.cwd(), 'content', '_test_depcache_' + Date.now());
  const olxDir = path.join(tmpDir, 'CONTENT'); // "CONTENT" == TEST_NS, so getOlxJson lines up
  await fs.mkdir(olxDir, { recursive: true });

  try {
    await fs.writeFile(path.join(olxDir, 'dep.olx'), '<Chat id="cached_dep" src="d.chatpeg" />');
    await fs.writeFile(path.join(olxDir, 'd.chatpeg'), 'Title: One\n~~~~\nBob: Hi [id=m1]\n');

    const provider = new FileStorageProvider(tmpDir);
    const first = await syncContentFromStorage(provider);
    expect(getOlxJson(first.idMap, 'cached_dep').kids.parsed.header.Title).toBe('One');

    // Edit ONLY the aux file. dep.olx's bytes (the parse-cache key) are unchanged,
    // so a naive cache would serve the stale parse. Dependency validation must
    // reject it. (mtime is the version — nudge the clock so the edit is distinct.)
    await new Promise(r => setTimeout(r, 20));
    await fs.writeFile(path.join(olxDir, 'd.chatpeg'), 'Title: Two\n~~~~\nBob: Hi [id=m1]\n');

    resetParseCacheStats();
    const second = await syncContentFromStorage(provider);

    // Re-parsed from a real miss, and reflects the new aux content.
    expect(getOlxJson(second.idMap, 'cached_dep').kids.parsed.header.Title).toBe('Two');
    expect(parseCacheStats().misses).toBeGreaterThanOrEqual(1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('a rebuild forced by one source re-parses nothing unchanged in the others', async () => {
  setParseCacheKvs(new MemoryKVStore());

  const a = new InMemoryStorageProvider({ 'memo_a.olx': '<Vertical id="memo_a"/>' });
  const b = new InMemoryStorageProvider({ 'memo_b.olx': '<Vertical id="memo_b"/>' });

  await syncContentUnion([a, b]); // cold: both files parsed

  // Move only b's token, forcing a full union rebuild.
  b.setContent('memo_c.olx', '<Vertical id="memo_c"/>');

  resetParseCacheStats();
  await syncContentUnion([a, b]);

  const stats = parseCacheStats();
  expect(stats.misses).toBe(1);              // only the new memo_c.olx
  expect(stats.memoHits).toBeGreaterThanOrEqual(2); // memo_a.olx + memo_b.olx served from cache
});
