// packages/shared/lib/records/archive.ts
//
// Building and restoring one unit's archive, DETERMINISTICALLY.
//
// WHY DETERMINISM MATTERS even though change detection hashes CONTENT rather
// than archive bytes: resumability. `rclone copy` skips an object whose hash
// already matches, so an interrupted snapshot resumes by being re-run -- but
// only if rebuilding an unchanged unit produces the same bytes. Without that,
// a resume re-uploads everything it had already done.
//
// Measured: identical input gives an identical archive across runs, with
// --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner and `gzip -n`.
// Each of those flags removes one source of drift: readdir order, file mtimes,
// the building user's uid/gid and name, and gzip's embedded timestamp.
//
// TAR.GZ FOR EVERY UNIT, INCLUDING SINGLE FILES, where a bare `gzip` would be
// the obvious choice. gzip of one file carries no name, no mode and no
// directory, so a restore has to reconstruct all three from the object's path
// and would silently drop an executable bit. This store has no executable files
// today (measured: zero), but the machinery is meant to serve any course, and a
// format that is correct only for the store that happened to be in front of me
// is the kind of assumption that surfaces years later as a corrupted restore.
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { dirname, relative, sep } from 'path';
import type { Unit } from './units';

const DETERMINISM = [
  '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
  '--format=gnu',
];

/**
 * Write `unit` to `dest` as a deterministic tar.gz. Paths inside are relative
 * to the STORE ROOT, so an archive says where it belongs and a restore cannot
 * put it somewhere else by accident.
 */
export function buildUnitArchive(storeRoot: string, unit: Unit, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  const members = unit.files.map(f => relative(storeRoot, f).split(sep).join('/'));
  // -T - reads the member list from stdin, so neither shell globbing nor
  // argument length limits can truncate a unit of 13,000 files.
  execFileSync('bash', ['-c',
    `cd ${JSON.stringify(storeRoot)} && tar ${DETERMINISM.join(' ')} ` +
    `-cf - -T - | gzip -n -9 > ${JSON.stringify(dest)}`,
  ], { input: members.join('\n') + '\n', stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * Extract an archive back into the store.
 *
 * NEVER OVERWRITES. `--keep-old-files` makes tar fail rather than replace, and
 * that is the contract restore needs: it exists to rebuild what is MISSING. An
 * overwriting restore could silently replace a record that had moved on since
 * the snapshot -- losing the newer state to recover the older one, which is the
 * precise opposite of the point. It is also what lets restore write under
 * `source/`, which the write guard otherwise refuses: creating what is absent
 * cannot destroy anything.
 */
export function restoreUnitArchive(archivePath: string, storeRoot: string): void {
  if (!existsSync(archivePath)) {
    throw new Error(`records: archive not found: ${archivePath}`);
  }
  mkdirSync(storeRoot, { recursive: true });
  execFileSync('tar', ['xzf', archivePath, '-C', storeRoot, '--keep-old-files'],
               { stdio: 'pipe' });
}

/** The files an archive holds, without extracting it. */
export function listArchive(archivePath: string): string[] {
  const out = execFileSync('tar', ['tzf', archivePath], { stdio: 'pipe' });
  return String(out).split('\n').filter(Boolean);
}
