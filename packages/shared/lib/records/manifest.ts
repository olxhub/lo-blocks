// packages/shared/lib/records/manifest.ts
//
// What the archive is BELIEVED to hold, recorded locally.
//
// WHY A LOCAL COPY AT ALL, when the remote is the authority. Two things need an
// answer faster than a network call can give one:
//
//   the write gate  "has this file's current content been archived?" is asked
//                   before every write to a record. A hash lookup is
//                   microseconds; even a healthy probe is ~400ms, and the gate
//                   would make every write wait on the network to answer a
//                   question the network does not actually know.
//   a quiet day     a snapshot with nothing to do should cost one listing, not
//                   1,088 round trips.
//
// IT IS A CACHE, NOT THE TRUTH. The remote is the authority and disagreement is
// resolved in its favour: an entry whose object is missing remotely is treated
// as unarchived, never the other way round. A manifest that could vouch for an
// object the archive does not have would be worse than no manifest, because the
// gate would let a write through on its word.
//
// EMPTY DIRECTORIES ARE RECORDED HERE because no archive can carry them: a
// `tar.gz` of an empty run directory holds nothing, and restore would silently
// omit it. Measured on this store: 26 of 685 run directories are empty. They
// carry no data, but their existence is a record that a run was attempted, and
// losing that quietly is the kind of gap nobody notices until they are counting.
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';

export interface ManifestEntry {
  /** Content hash of the unit when it was last archived. */
  hash: string;
  /** When it was uploaded, ISO. */
  at: string;
  bytes: number;
}

export interface Manifest {
  version: 1;
  /** Keyed by unit key, which is also the remote object path. */
  units: Record<string, ManifestEntry>;
  /** Directories that exist locally but hold no files; see the note above. */
  emptyDirs: string[];
}

const EMPTY: Manifest = { version: 1, units: {}, emptyDirs: [] };

/** The manifest's home: bookkeeping, deliberately OUTSIDE any `<kind>/<id>`. */
export function manifestPath(storeRoot: string): string {
  return join(storeRoot, '.archive', 'manifest.json');
}

export function readManifest(storeRoot: string): Manifest {
  const p = manifestPath(storeRoot);
  if (!existsSync(p)) return { ...EMPTY, units: {}, emptyDirs: [] };
  try {
    const m = JSON.parse(readFileSync(p, 'utf-8')) as Manifest;
    if (m?.version !== 1 || typeof m.units !== 'object') throw new Error('shape');
    return { version: 1, units: m.units || {}, emptyDirs: m.emptyDirs || [] };
  } catch {
    // AN UNREADABLE MANIFEST IS NOT AN EMPTY ONE, but it has to be treated as
    // one: every unit then looks unarchived, so the next snapshot re-uploads
    // and the gate refuses until it has. Both are the SAFE direction. Returning
    // a partial parse would let the gate vouch for objects nobody verified.
    return { version: 1, units: {}, emptyDirs: [] };
  }
}

/** Written via a temp file and renamed: a half-written manifest vouches wrongly. */
export function writeManifest(storeRoot: string, m: Manifest): void {
  const p = manifestPath(storeRoot);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(m, null, 1) + '\n');
  renameSync(tmp, p);
}

/** Is this exact content already archived, according to the manifest? */
export function isArchived(m: Manifest, key: string, hash: string): boolean {
  return m.units[key]?.hash === hash;
}

/**
 * Has this key EVER been archived, whatever its content?
 *
 * The write gate's question. A file whose archived copy exists may be
 * overwritten -- the previous state is safe, and the intermediate versions
 * between snapshots were never promised. A file with no archived copy at all
 * may not: overwriting it destroys the only copy there has ever been.
 */
export function everArchived(m: Manifest, key: string): boolean {
  return m.units[key] !== undefined;
}

export function record(m: Manifest, key: string, hash: string, bytes: number): void {
  m.units[key] = { hash, at: new Date().toISOString(), bytes };
}

/** A short digest of the manifest, for logs and for spotting divergence. */
export function manifestFingerprint(m: Manifest): string {
  const h = createHash('sha256');
  for (const k of Object.keys(m.units).sort()) { h.update(k); h.update(m.units[k].hash); }
  return h.digest('hex').slice(0, 12);
}
