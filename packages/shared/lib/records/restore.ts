// packages/shared/lib/records/restore.ts
//
// Pulling a course's records out of the archive so a build can run.
//
// SCOPED TO THIS INSTALL. Only the courses actually mounted here, and only the
// rubric and instrument those courses use, are materialised. A clone that
// serves one course has no business carrying another's records, and the store
// may well hold several.
//
// IT RESTORES WHAT IS MISSING, AND ONLY THAT. Every extraction is
// --keep-old-files, so an existing file is never replaced: restore exists to
// rebuild a tree that is not there, and overwriting a record that moved on
// since the snapshot would lose the newer state to recover the older one. That
// is also what lets it write under `source/`, which the write guard otherwise
// refuses -- creating what is absent cannot destroy anything.
//
// A MISSING ARCHIVE IS FATAL, not an empty restore. A build that proceeded on
// an empty store would measure nothing and report it as a result, which is the
// failure this whole archive exists to make impossible.
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { mountedCourses, rubricFile, rubricDir, instrumentDir } from '@/lib/llm/enforce/courseData';
import { restoreUnitArchive } from './archive';
import { reachable, rcloneArgs, remoteFor, TRANSFERS, type RemoteSpec } from './remote';

export interface Need { kind: 'rubrics' | 'instruments'; id: string; dir: string; }

/** The `<kind>/<id>` directories this install needs, from what is mounted. */
export function neededFor(ns: string): Need[] {
  const out: Need[] = [];
  const rf = rubricFile(ns);
  if (rf) out.push({ kind: 'rubrics', id: basename(rf).replace(/\.olx$/, ''),
                     dir: rubricDir(ns) });
  const idir = instrumentDir(ns);
  if (idir) out.push({ kind: 'instruments', id: basename(idir), dir: idir });
  return out;
}

/** Everything this install needs, across every mounted course. */
export function needed(): Array<{ ns: string; need: Need }> {
  return mountedCourses().flatMap(ns => neededFor(ns).map(need => ({ ns, need })));
}

/** Objects under a prefix, excluding the `.prev` half of each pair. */
function remoteObjects(spec: RemoteSpec, prefix: string): string[] {
  const out = execFileSync('rclone',
    ['lsf', '-R', '--files-only', `${spec.path}/${prefix}`, ...rcloneArgs(spec)],
    { stdio: 'pipe', timeout: 300_000 });
  return String(out).split('\n').filter(Boolean)
    .filter(p => !p.endsWith('.prev.tar.gz'))
    .map(p => `${prefix}/${p}`);
}

/**
 * The local path an object restores to: the key minus its `.tar.gz`.
 *
 * For an add-only unit that is a DIRECTORY, which is why presence is tested
 * rather than file equality -- the archive carries the whole run, so the
 * question is whether the run is here at all.
 */
export function targetOf(key: string): string {
  return key.replace(/\.tar\.gz$/, '');
}

export interface RestoreResult { pulled: number; present: number; created: string[]; }

export function restore(storeRoot: string, ns: string,
                        log: (s: string) => void = () => {}): RestoreResult {
  const spec = remoteFor(ns);
  if (!spec) throw new Error(`records: ${ns} declares no archive and none is configured`);
  const live = reachable(spec);
  if (!live.ok) {
    throw new Error(`records: ${ns} needs records from the archive and it is `
      + `unreachable: ${live.why || 'no detail'}. A build cannot invent them.`);
  }
  const created: string[] = [];
  let pulled = 0, present = 0;

  for (const need of neededFor(ns)) {
    const prefix = `${need.kind}/${need.id}`;
    let keys: string[];
    try {
      keys = remoteObjects(spec, prefix);
    } catch {
      throw new Error(`records: ${ns} needs ${prefix}, and the archive holds `
        + `nothing under it. Snapshot the records from an install that has `
        + `them, or correct the archive location.`);
    }
    if (!keys.length) {
      throw new Error(`records: the archive holds no objects for ${prefix}`);
    }
    if (!existsSync(need.dir)) { mkdirSync(need.dir, { recursive: true }); created.push(need.dir); }

    const missing = keys.filter(k => !existsSync(join(storeRoot, targetOf(k))));
    present += keys.length - missing.length;
    if (!missing.length) continue;
    log(`${ns}: ${missing.length} of ${keys.length} object(s) missing under ${prefix}`);

    // ONE PARALLEL FETCH, not a download per object: the transfer is latency
    // bound, exactly as the upload is, and a thousand sequential round trips
    // would take an hour where a parallel pass takes minutes.
    const stage = join(storeRoot, '.archive', 'restore-stage');
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    try {
      execFileSync('rclone', ['copy', `${spec.path}/${prefix}`, join(stage, prefix),
                              ...rcloneArgs(spec), ...TRANSFERS,
                              '--exclude', '*.prev.tar.gz'],
                   { stdio: 'pipe', timeout: 3_600_000 });
      for (const k of missing) {
        restoreUnitArchive(join(stage, k), storeRoot);
        pulled++;
      }
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
  return { pulled, present, created };
}

/** Restore for every mounted course. The build's entry point. */
export function restoreAll(storeRoot: string, log: (s: string) => void = () => {}): RestoreResult {
  const all: RestoreResult = { pulled: 0, present: 0, created: [] };
  for (const ns of mountedCourses()) {
    const r = restore(storeRoot, ns, log);
    all.pulled += r.pulled; all.present += r.present; all.created.push(...r.created);
  }
  return all;
}
