// packages/shared/lib/content/parseCache.ts
//
// KVS-persisted, hash-keyed cache for parseOLX output. A cold boot with
// unchanged content re-parses NOTHING: the parse step becomes a KVS read.
//
// ── WHAT parseOLX OUTPUT DEPENDS ON (the cache key) ──────────────────────────
// parseOLX(xml, [ref], resolver, ns) is a pure function of its inputs. Its
// output (ids, idMap, root, errors) is fully determined by:
//
//   1. contentHash  — the file bytes. Different bytes → different tree, IDs,
//                      auto-generated ids (SHA1 of node JSON), and errors.
//   2. ns           — the content namespace. idMap keys are ns-qualified and
//                      <Use ref="…"> targets are qualified with ns, so the SAME
//                      bytes under a different namespace produce a different
//                      idMap. MUST be in the key.
//   3. provenanceRef — the input ref (fileRecord.id, unversioned). parseOLX
//                      stamps `source = withVersion(ref, contentHash)` onto
//                      every entry and into every error's provenance. The SAME
//                      bytes at a different origin/path produce DIFFERENT output
//                      (different `source` strings). MUST be in the key. Pairing
//                      an unversioned ref with contentHash also distinguishes the
//                      same path across edits, so this subsumes cross-source dedup
//                      without ever merging genuinely-different outputs.
//   4. parserVersion — the parser build. Attribute Zod schemas, per-block
//                      parsers, and generated PEG parsers all shape parse output.
//                      A grammar or schema change with unchanged bytes must
//                      invalidate. Derived by hashing the generated build files
//                      (see parserVersion() below).
//
// NOT in the key, by design:
//   • manifest — parseOLX does NOT read it. syncContentFromStorage stamps
//     olxJson.manifest AFTER parseOLX returns (only the provider knows it), so
//     it is re-applied on every sync outside this cache. A manifest change that
//     alters the namespace re-parses via a changed `ns` component; a change that
//     only alters manifest provenance is re-stamped post-cache. Correct either way.
//   • resolver/provider — used only for src="" asset resolution, whose results
//     are recorded as parseDeps and invalidated by the scan's dependency
//     tracking (level 2), not the parse cache.
//
// KNOWN LIMITATION (documented, accepted per design brief): parserVersion hashes
// the GENERATED registry/parser artifacts. Hand-editing a block's Zod schema or
// a .pegjs grammar WITHOUT regenerating (`npm run build:gen-block-registry` /
// `build:parser-registry`) will not bust the cache. Regenerate, bump
// SCHEMA_VERSION, or `rm -rf data/kvs/parse` after such edits.
//
// ── SERIALIZATION ────────────────────────────────────────────────────────────
// Entries round-trip through JSON. OlxJson is already a JSON payload (it is
// dispatched as olxjson and persisted elsewhere). The one non-JSON artifact —
// fast-xml-parser's XML_META symbol on ErrorNode.rawParsed — is invisible to
// JSON.stringify by construction and carries no post-parse meaning (the byte
// offset it held is copied into the real numeric `_sourceOffset` field during
// parse). Parse ERRORS are cached too: same bytes → same errors, so a broken
// file is diagnosed once, not re-parsed every boot. On a cache MISS we return
// the JSON round-trip of the fresh parse (not the raw objects) so cold and warm
// boots hand identical, normalized object graphs to downstream code.

import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import type { KVStore } from '@/lib/storage/kvs';
import { kvsKey } from '@/lib/types/identity';
import { hashContent } from '@/lib/util';

// Bump when the cached entry SHAPE changes (a new field consumed downstream, a
// different serialization). Part of the key, so a bump is a clean cold cache.
const SCHEMA_VERSION = '1';

// ── Injection seam ───────────────────────────────────────────────────────────
// Set once at server boot. Without a KVS, cachedParse is a pure passthrough so
// CLI scripts and library tests parse uncached with zero configuration.
let _kvs: KVStore | null = null;

export function setParseCacheKvs(kvs: KVStore | null): void {
  _kvs = kvs;
}

// ── Stats (surfaced on the boot "Sync content" line) ─────────────────────────
let _hits = 0;
let _misses = 0;
let _memoHits = 0;

export interface ParseCacheStats {
  /** Served from the KVS (persisted across restarts). */
  hits: number;
  /** Parsed on this run (not previously cached, or content changed). */
  misses: number;
  /** Served from the in-process memo (repeat sync in one process). */
  memoHits: number;
}

export function parseCacheStats(): ParseCacheStats {
  return { hits: _hits, misses: _misses, memoHits: _memoHits };
}

export function resetParseCacheStats(): void {
  _hits = 0;
  _misses = 0;
  _memoHits = 0;
}

// In-process memoization in front of the KVS, keyed by the same digest. Repeat
// syncs in one process skip the KVS entirely. Stores the serialized string; each
// read JSON.parses a fresh graph so a caller mutating the result (e.g.
// syncContentFromStorage stamping olxJson.manifest) can never corrupt the memo.
const _memo = new Map<string, string>();

// ── parserVersion: hash of the generated build ───────────────────────────────
// Computed lazily on first cached parse (never when the cache is a passthrough),
// then memoized for the process. Reads the generated, build-local, gitignored
// artifacts at RUNTIME (they don't exist until the build runs) with a clear
// error if the build hasn't been run.
let _parserVersion: string | null = null;

/** Directory of this module, for resolving sibling generated artifacts. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = path.resolve(HERE, '../..'); // packages/shared

/** Recursively collect generated PEG parser files (`_*Parser.js`) under
 *  packages/shared, skipping node_modules. Grammar edits change these even when
 *  the parserRegistry import list does not. */
function collectPegParserFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPegParserFiles(full, out);
    } else if (/^_.*Parser\.js$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function computeParserVersion(): string {
  // The generated registry + per-block metadata, plus every compiled PEG parser.
  const registrySources = [
    path.join(SHARED_ROOT, 'components/blockRegistryAutogen.ts'),
    path.join(SHARED_ROOT, 'components/blockMetadataAutogen.json'),
    path.join(SHARED_ROOT, 'generated/parserRegistry.ts'),
  ];
  const pegParsers: string[] = [];
  collectPegParserFiles(SHARED_ROOT, pegParsers);
  pegParsers.sort();

  const files = [...registrySources, ...pegParsers];
  const hash = createHash('sha256');
  for (const file of files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(file);
    } catch (err) {
      throw new Error(
        `[parseCache] Cannot read generated build artifact required for the ` +
        `parse-cache key: ${file}\n` +
        `The build has not been run. Run \`npm run build:gen-block-registry\` ` +
        `and \`npm run build:parser-registry\` (or the full build) first.\n` +
        `Underlying error: ${(err as Error).message}`
      );
    }
    // Length-prefix each file so concatenation is unambiguous.
    hash.update(path.relative(SHARED_ROOT, file));
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function parserVersion(): string {
  if (_parserVersion === null) _parserVersion = computeParserVersion();
  return _parserVersion;
}

// ── The cache ────────────────────────────────────────────────────────────────

export interface ParseCacheKeyParts {
  /** Content namespace (idMap keys are qualified with this). */
  ns: string;
  /** Input provenance ref, UNVERSIONED (e.g. fileRecord.id). */
  provenanceRef: string;
  /** The raw XML being parsed; hashed for the content component of the key. */
  content: string;
}

/** Digest the full logical key into a flat hex token for the KVS. */
async function digestKey(parts: ParseCacheKeyParts): Promise<string> {
  const contentHash = await hashContent(parts.content);
  const payload = [
    parserVersion(),
    parts.ns,
    parts.provenanceRef,
    contentHash,
  ].join(' ');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Read-through / write-through parse cache.
 *
 * On hit (memo or KVS): returns a fresh JSON parse of the stored entry.
 * On miss: runs parseFn, stores the JSON serialization, and returns the JSON
 * round-trip (so cold and warm boots yield identical normalized graphs).
 * Without a KVS set: pure passthrough (returns parseFn() directly).
 *
 * parseFn output MUST be JSON-serializable (parseOLX output is — see header).
 */
export async function cachedParse<T>(
  parts: ParseCacheKeyParts,
  parseFn: () => Promise<T>,
): Promise<T> {
  if (!_kvs) return parseFn();

  const digest = await digestKey(parts);

  const memoized = _memo.get(digest);
  if (memoized !== undefined) {
    _memoHits++;
    return JSON.parse(memoized) as T;
  }

  const key = kvsKey.parseCache(SCHEMA_VERSION, digest);
  const stored = await _kvs.get(key);
  if (stored !== null) {
    _hits++;
    _memo.set(digest, stored);
    return JSON.parse(stored) as T;
  }

  _misses++;
  const result = await parseFn();
  const serialized = JSON.stringify(result);
  _memo.set(digest, serialized);
  await _kvs.set(key, serialized);
  return JSON.parse(serialized) as T;
}
