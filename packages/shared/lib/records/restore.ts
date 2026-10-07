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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { mountedCourses, scoringId, loBlocksRoot } from '@/lib/llm/enforce/courseData';
import { restoreUnitArchive } from './archive';
import { filesUnder, unitHash } from './units';
import { readManifest, writeManifest, record, type Manifest } from './manifest';
import { missing as missingRequired } from './required';
import { reachable, rcloneArgs, remoteFor, TRANSFERS, type RemoteSpec } from './remote';

export interface Need { kind: 'rubrics' | 'instruments'; id: string; dir: string; }

/**
 * Where this install's record store belongs, whether or not it is there yet.
 *
 * NOT `courseDir`, which RESOLVES the store and therefore refuses when it is
 * absent -- the exact state restore exists to fix. Asking the resolver would
 * make the first restore impossible: it could not find out what to restore
 * without the thing it was about to restore.
 */
export function storeRootFor(): string {
  const root = loBlocksRoot();
  if (!root) throw new Error('records: cannot find the lo-blocks root');
  return join(root, '..', 'course_data');
}

/**
 * The `<kind>/<id>` directories this install needs.
 *
 * THE IDS COME FROM THE COURSE REPO, BY SHAPE, not from the store. `scoringId`
 * reads them off the rubric file -- `bmod_rubric.olx` gives rubric `bmod_rubric`
 * and instrument `bmod` -- so a clone with no records at all can still say what
 * it is missing. The first cut asked `rubricDir`/`instrumentDir`, which go
 * through the store resolver and threw "no course_data/ sits beside the
 * lo-blocks checkout" before restore could do anything about it.
 */
export function neededFor(ns: string): Need[] {
  const store = storeRootFor();
  const out: Need[] = [];
  for (const [kind, key] of [['rubrics', 'rubric_id'], ['instruments', 'instrument_id']] as const) {
    let id = '';
    try { id = scoringId(ns, key); } catch { continue; }
    if (id) out.push({ kind, id, dir: join(store, kind, id) });
  }
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
 * The archive's ROOT objects -- the store's loose files, `corpus_refs.json`
 * among them.
 *
 * NO `-R`. The listing has to stop at depth one: recursing would return every
 * object in the archive and the root pass would try to restore the whole store
 * before the scoped passes ran at all.
 */
function remoteRootObjects(spec: RemoteSpec): string[] {
  let out: Buffer;
  try {
    out = execFileSync('rclone',
      ['lsf', '--files-only', spec.path, ...rcloneArgs(spec)],
      { stdio: 'pipe', timeout: 300_000 }) as Buffer;
  } catch {
    // THE COURSE'S FOLDER NEED NOT EXIST YET. On the first build of a course
    // nothing has ever created it, and rclone calls that "directory not found"
    // -- a legitimate empty answer here, not a failure. Liveness is settled
    // separately, against the archive ROOT, so a genuinely dead remote is
    // already refused before this runs and is not what gets swallowed here.
    return [];
  }
  return String(out).split('\n').filter(Boolean)
    .filter(p => !p.endsWith('.prev.tar.gz'));
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

/**
 * Write a restored unit into the manifest.
 *
 * A RESTORED INSTALL REALLY DOES HAVE THESE OBJECTS ARCHIVED -- it has them
 * BECAUSE they are archived. Until this existed, only an install that had
 * uploaded knew that, and a clone's manifest stayed empty forever, with two
 * consequences. The write gate, which asks `everArchived`, refused every edit
 * on a freshly restored machine: the files were durable and the gate had no way
 * to find out. And `needsRestore` could not tell that a store-root file had
 * gone missing, because its manifest clause had no manifest to read -- the test
 * for that case passed by vacuum, which is how the hole showed itself.
 *
 * The hash is computed from what is now ON DISK, not taken on trust from the
 * archive. If an extraction ever produced something other than what was
 * uploaded, the next snapshot sees a changed unit and re-uploads, rather than
 * the manifest asserting a match nobody checked.
 */
function noteRestored(storeRoot: string, m: Manifest, key: string): void {
  const target = join(storeRoot, targetOf(key));
  let files: string[];
  try {
    files = statSync(target).isDirectory() ? filesUnder(target) : [target];
  } catch { return; }                       // nothing landed; leave it unarchived
  if (!files.length) return;
  const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
  record(m, key, unitHash(storeRoot, files), bytes);
}

export interface RestoreResult {
  pulled: number; present: number; created: string[];
  /** Prefixes the archive holds nothing for: a course not yet archived. */
  fresh: string[];
}

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
  const fresh: string[] = [];
  const m = readManifest(storeRoot);
  let pulled = 0, present = 0;

  // THE ROOT FIRST. Its files are owned by no course and read by every build;
  // a store whose `<kind>/<id>` trees are all present is still unbuildable
  // without them.
  if (!existsSync(storeRoot)) { mkdirSync(storeRoot, { recursive: true }); created.push(storeRoot); }
  for (const key of remoteRootObjects(spec)) {
    if (existsSync(join(storeRoot, targetOf(key)))) { present++; continue; }
    log(`${ns}: restoring store-root ${targetOf(key)}`);
    const stage = join(storeRoot, '.archive', 'restore-stage');
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    try {
      execFileSync('rclone', ['copyto', `${spec.path}/${key}`, join(stage, key),
                              ...rcloneArgs(spec)],
                   { stdio: 'pipe', timeout: 600_000 });
      restoreUnitArchive(join(stage, key), storeRoot);
      noteRestored(storeRoot, m, key);
      pulled++;
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }

  for (const need of neededFor(ns)) {
    const prefix = `${need.kind}/${need.id}`;
    let keys: string[] = [];
    try { keys = remoteObjects(spec, prefix); } catch { /* no such prefix yet */ }

    // NOTHING ARCHIVED UNDER THIS PREFIX MEANS ONE OF TWO OPPOSITE THINGS, and
    // the local tree is what tells them apart.
    //
    // No objects AND nothing on disk: a course being built for the first time.
    // It has no records because none have been made yet, and refusing would
    // make the first build of every new course impossible. Its archive folder
    // gets created by the first snapshot.
    //
    // No objects BUT files on disk: a real store that has never been archived.
    // Here the build must stop. Carrying on would invent starting files beside
    // a course's actual records, and the next snapshot would archive the
    // mixture as though it were the course.
    if (!keys.length) {
      let onDisk = 0;
      try { onDisk = readdirSync(need.dir).length; } catch { /* absent */ }
      if (onDisk) {
        throw new Error(`records: ${prefix} exists here but the archive holds `
          + `nothing for it. Archive it before building: npm run records:snapshot`);
      }
      fresh.push(prefix);
      if (!existsSync(need.dir)) { mkdirSync(need.dir, { recursive: true }); created.push(need.dir); }
      continue;
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
        noteRestored(storeRoot, m, k);
        pulled++;
      }
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
  if (pulled) writeManifest(storeRoot, m);
  return { pulled, present, created, fresh };
}

/**
 * Does this install need anything pulled before it can build?
 *
 * ASKED LOCALLY, AND ONLY LOCALLY. A build must not need the network to find
 * out that it already has everything: a developer on a plane, or on a machine
 * with no archive credentials, has a complete store and every right to build
 * from it. Listing the remote on every build would also charge a round trip per
 * build to learn "nothing to do" -- the common case by far.
 *
 * The test is therefore PLAUSIBLE PRESENCE, not verified completeness, which
 * only the archive can settle:
 *   - every `<kind>/<id>` this install needs exists and is not empty, and
 *   - every store-root object the manifest knows about is on disk.
 *
 * The manifest clause is what catches a store whose course trees are all there
 * but whose root is not -- the state that got a fully restored clone to fail
 * its build on one 192 KB file. A fresh clone has no manifest and fails the
 * first clause anyway, so nothing rests on the manifest being there.
 */
export function needsRestore(storeRoot: string): boolean {
  for (const { need } of needed()) {
    let n = 0;
    try { n = readdirSync(need.dir).length; } catch { return true; }
    if (!n) return true;
  }
  // A MISSING REQUIRED FILE IS A RESTORE QUESTION BEFORE IT IS A SCAFFOLDING
  // ONE. On an established course the archive probably holds it, and creating a
  // starting file without asking would put a blank ledger where the real one
  // belongs. Asking here is what makes the build-time policy safe for a course
  // that already exists, not just for a clone.
  for (const { need } of needed()) {
    const other = needed().find(o => o.need.kind !== need.kind)?.need;
    if (need.kind !== 'instruments' || !other) continue;
    if (missingRequired(need.dir, other.dir).length) return true;
  }

  let m: { units?: Record<string, unknown> };
  try { m = JSON.parse(readFileSync(join(storeRoot, '.archive', 'manifest.json'), 'utf8')); }
  catch { return false; }
  for (const key of Object.keys(m.units || {})) {
    if (key.includes('/')) continue;                       // scoped, covered above
    if (!existsSync(join(storeRoot, targetOf(key)))) return true;
  }
  return false;
}

/** Restore for every mounted course. The build's entry point. */
export function restoreAll(storeRoot: string, log: (s: string) => void = () => {}): RestoreResult {
  const all: RestoreResult = { pulled: 0, present: 0, created: [], fresh: [] };
  for (const ns of mountedCourses()) {
    const r = restore(storeRoot, ns, log);
    all.pulled += r.pulled; all.present += r.present;
    all.created.push(...r.created); all.fresh.push(...r.fresh);
  }
  return all;
}
