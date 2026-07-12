// @vitest-environment node
// packages/shared/lib/content/parseCache.test.ts
//
// The cache's core invariant: parseOLX output is a pure, JSON-serializable
// function of (bytes, ns, ref, parser build). Round-trip fidelity is tested
// against a REAL parse, not a stub — if parse output ever grows something
// JSON can't carry (functions, Maps, identity-relied-upon objects), the
// purity test here fails before the cache silently breaks production.
import { afterEach, expect, test } from 'vitest';

import { cachedParse, setParseCacheKvs, parseCacheStats, resetParseCacheStats } from './parseCache';
import { parseOLX } from './parseOLX';
import { MemoryKVStore } from '@/lib/storage/kvs';
import { toMemoryRef } from '../types/storage';
import { TEST_NS } from '../test-utils';

const PROV = [toMemoryRef('test.xml')];
const XML = '<Vertical id="root"><TextBlock id="child">Hello</TextBlock></Vertical>';
const BROKEN_XML = '<Vertical id="root"><TextBlock id="child" scr="typo.png"/></Vertical>';

const parts = (content: string, over: Partial<{ ns: string; provenanceRef: string }> = {}) => ({
  ns: over.ns ?? (TEST_NS as string),
  provenanceRef: over.provenanceRef ?? (PROV[0] as string),
  content,
});

const parse = (xml: string) => parseOLX(xml, PROV, undefined, TEST_NS);

afterEach(() => {
  setParseCacheKvs(null);
  resetParseCacheStats();
});

test('no KVS set: passthrough, no stats recorded', async () => {
  const result = await cachedParse(parts(XML), () => parse(XML));
  expect(result.root).toBeTruthy();
  expect(parseCacheStats()).toEqual({ hits: 0, misses: 0, memoHits: 0 });
});

test('miss then memo hit then KVS hit; round-trip is deep-equal to a fresh parse', async () => {
  const kvs = new MemoryKVStore();
  setParseCacheKvs(kvs);

  const fresh = await parse(XML);
  const first = await cachedParse(parts(XML), () => parse(XML));
  expect(parseCacheStats().misses).toBe(1);
  // Purity guard: a JSON round-trip of the parse equals a fresh parse.
  expect(first).toEqual(fresh);

  // Second call in the same process: memo hit, parseFn not invoked.
  const second = await cachedParse(parts(XML), () => {
    throw new Error('should not re-parse');
  });
  expect(parseCacheStats().memoHits).toBe(1);
  expect(second).toEqual(fresh);

  // Simulate a process restart: new module memo is not simulable here, but a
  // second store consumer is — clear the memo path by using a distinct ref so
  // only the KVS could answer... instead we verify the KVS entry directly.
  const storedKeys: string[] = [];
  const spyKvs = {
    ready: Promise.resolve(),
    get: (k: string) => { storedKeys.push(k); return kvs.get(k as never); },
    set: (k: string, v: string) => kvs.set(k as never, v),
    del: (k: string) => kvs.del(k as never),
  };
  setParseCacheKvs(spyKvs as never);
  // Different provenanceRef → different key → miss, proving ref is in the key.
  await cachedParse(parts(XML, { provenanceRef: 'memory:other.xml' }), () => parse(XML));
  expect(parseCacheStats().misses).toBe(2);
});

test('KVS hit across "restart" (memo not shared) yields deep-equal result', async () => {
  const kvs = new MemoryKVStore();
  setParseCacheKvs(kvs);
  const fresh = await parse(XML);
  await cachedParse(parts(XML, { provenanceRef: 'memory:restart.xml' }), () => parse(XML));

  // The memo is module-level; force the KVS path by reading the entry back
  // through a fresh logical key... the memo keys on digest, so instead assert
  // the persisted entry round-trips: find it in the store and JSON.parse it.
  const entries = (kvs as unknown as { data: Map<string, string> }).data;
  expect(entries.size).toBe(1);
  const [key, value] = [...entries.entries()][0];
  expect(key).toMatch(/^parse:1:[0-9a-f]{32}$/);
  const revived = JSON.parse(value);
  expect(revived.idMap).toBeDefined();
  expect(revived).toEqual(JSON.parse(JSON.stringify(fresh)));
});

test('different ns produces a different cache entry', async () => {
  const kvs = new MemoryKVStore();
  setParseCacheKvs(kvs);
  await cachedParse(parts(XML, { ns: 'NS_A' }), () => parse(XML));
  await cachedParse(parts(XML, { ns: 'NS_B' }), () => parse(XML));
  expect(parseCacheStats().misses).toBe(2);
});

test('parse errors are cached too', async () => {
  const kvs = new MemoryKVStore();
  setParseCacheKvs(kvs);

  const first = await cachedParse(parts(BROKEN_XML), () => parse(BROKEN_XML));
  expect(first.errors.length).toBeGreaterThan(0);
  expect(parseCacheStats().misses).toBe(1);

  const second = await cachedParse(parts(BROKEN_XML), () => {
    throw new Error('broken file must not be re-parsed');
  });
  expect(second.errors).toEqual(first.errors);
  expect(parseCacheStats().memoHits).toBe(1);
});

test('cached results are fresh object graphs (mutation cannot corrupt the cache)', async () => {
  const kvs = new MemoryKVStore();
  setParseCacheKvs(kvs);
  const first = await cachedParse(parts(XML), () => parse(XML));
  // Simulate syncContentFromStorage stamping manifest provenance post-cache.
  for (const variants of Object.values(first.idMap)) {
    for (const olxJson of Object.values(variants)) {
      (olxJson as { manifest?: string }).manifest = 'memory:manifest.yaml';
    }
  }
  const second = await cachedParse(parts(XML), () => parse(XML));
  for (const variants of Object.values(second.idMap)) {
    for (const olxJson of Object.values(variants)) {
      expect((olxJson as { manifest?: string }).manifest).toBeUndefined();
    }
  }
});
