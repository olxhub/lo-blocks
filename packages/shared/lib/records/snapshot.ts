// packages/shared/lib/records/snapshot.ts
//
// What a snapshot would do, and doing it.
//
// THE PLAN IS SEPARATE FROM THE ACT, deliberately. A snapshot writes to an
// outward service and pins revisions that can never be freed, so "what is about
// to happen" has to be answerable without making it happen.
//
// ORDER WITHIN A UNIT: rotate, then upload. If the rotation fails the run stops
// having changed nothing. The reverse order loses a step silently whenever the
// rotation fails -- the previous state is overwritten before its copy exists.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { unitsFor, unitHash, storeDirs, rootUnits, type Unit } from './units';
import { buildUnitArchive } from './archive';
import { readManifest, writeManifest, record, isArchived, type Manifest } from './manifest';
import { reachable, ensureCourseDir, rcloneArgs, remoteRoot, TRANSFERS, PIN,
         type RemoteSpec } from './remote';

export interface PlannedUnit { unit: Unit; hash: string; reason: 'new' | 'changed'; }
export interface Plan {
  /** Units needing upload, and why. */
  todo: PlannedUnit[];
  /** Units already archived with this exact content. */
  unchanged: number;
  /** Keys present remotely that this unit would overwrite -> rotate first. */
  rotate: string[];
  emptyDirs: string[];
  bytes: number;
}

/** Everything the remote holds under this course, as key -> true. One listing. */
export function remoteKeys(spec: RemoteSpec): Set<string> {
  try {
    const out = execFileSync('rclone',
      ['lsjson', '-R', '--files-only', spec.path, ...rcloneArgs(spec)],
      { stdio: 'pipe', timeout: 120_000 });
    return new Set((JSON.parse(String(out)) as Array<{ Path: string }>).map(x => x.Path));
  } catch {
    // An unreadable listing is NOT an empty remote. Returning an empty set
    // would make every unit look new, re-upload the world, and -- worse --
    // rotate nothing, because nothing appears to be there to rotate.
    throw new Error('records: cannot list the remote; refusing to plan blind');
  }
}

/**
 * The units this install is responsible for.
 *
 * SCOPED TO WHAT IS MOUNTED HERE. A clone that serves one course has no
 * business snapshotting another's records, and `storeDirs` would happily walk
 * everything the store happens to contain.
 */
export function unitsForInstall(storeRoot: string, want: Array<[string, string]>): Unit[] {
  const have = new Set(storeDirs(storeRoot).map(([k, i]) => `${k}/${i}`));
  const scoped = want.filter(([k, i]) => have.has(`${k}/${i}`))
             .flatMap(([k, i]) => unitsFor(storeRoot, k, i));
  // THE ROOT IS NOT SCOPED TO AN INSTALL. Its files belong to no course, and
  // every build reads them, so they go wherever the store goes.
  return [...rootUnits(storeRoot), ...scoped];
}

export function plan(storeRoot: string, units: Unit[], m: Manifest,
                     present: Set<string>): Plan {
  const todo: PlannedUnit[] = [];
  const rotate: string[] = [];
  let unchanged = 0, bytes = 0;
  for (const u of units) {
    const hash = unitHash(storeRoot, u.files);
    // BOTH the manifest AND the remote must agree it is there. The manifest
    // alone would vouch for an object someone deleted remotely; the remote
    // alone cannot tell us whether the CONTENT still matches.
    if (isArchived(m, u.key, hash) && present.has(u.key)) { unchanged++; continue; }
    todo.push({ unit: u, hash, reason: present.has(u.key) ? 'changed' : 'new' });
    bytes += u.bytes;
    // ADD-ONLY UNITS ARE NOT ROTATED. A run that changed is a run being
    // corrected, and Drive's own revisions hold what it was; spending a
    // `.prev` object on every run would double an archive that is 659 runs
    // deep and never read backwards.
    if (present.has(u.key) && u.kind === 'perfile') rotate.push(u.key);
  }
  return { todo, unchanged, rotate, emptyDirs: [], bytes };
}

export interface SnapshotResult { uploaded: number; rotated: number; unchanged: number; }

export function snapshot(storeRoot: string, spec: RemoteSpec, units: Unit[],
                         log: (s: string) => void = () => {}): SnapshotResult {
  const live = reachable(spec);
  if (!live.ok) {
    throw new Error(`records: the archive is unreachable, so nothing can be `
      + `snapshotted: ${live.why || 'no detail'}`);
  }
  if (!ensureCourseDir(spec)) log(`created the course folder ${spec.path}`);

  const m = readManifest(storeRoot);
  const present = remoteKeys(spec);
  const p = plan(storeRoot, units, m, present);
  log(`${p.todo.length} to upload, ${p.unchanged} unchanged, ${p.rotate.length} to rotate`);
  if (!p.todo.length) return { uploaded: 0, rotated: 0, unchanged: p.unchanged };

  const stage = mkdtempSync(join(tmpdir(), 'records-'));
  try {
    for (const key of p.rotate) {
      execFileSync('rclone', ['copyto', `${spec.path}/${key}`,
                              `${spec.path}/${prevKey(key)}`, ...rcloneArgs(spec), ...PIN],
                   { stdio: 'pipe', timeout: 120_000 });
    }
    for (const { unit } of p.todo) {
      buildUnitArchive(storeRoot, unit, join(stage, unit.key));
    }
    execFileSync('rclone', ['copy', stage, spec.path, ...rcloneArgs(spec),
                            ...PIN, ...TRANSFERS],
                 { stdio: 'pipe', timeout: 3_600_000 });
    for (const { unit, hash } of p.todo) {
      record(m, unit.key, hash, statSync(join(stage, unit.key)).size);
    }
    writeManifest(storeRoot, m);
    return { uploaded: p.todo.length, rotated: p.rotate.length, unchanged: p.unchanged };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * Give every unit a `.prev` equal to its current state.
 *
 * THE BOOTSTRAP LEAVES NO PAIR, and that is not a detail. A first snapshot has
 * nothing to rotate, so every unit lands with a current and no previous -- and
 * the checks that read the previous state then get `null`, which they correctly
 * report as "no prior state to compare against". That is true but useless: it
 * is the same answer they gave when the records had no git history at all.
 *
 * Seeding prev = current makes the pair valid from the first moment. The
 * comparison it supports is "nothing has changed since the archive was
 * created", which is an honest answer and a usable one, where "no prior state"
 * is neither.
 *
 * UPLOADED, NOT SERVER-SIDE COPIED. A copy per unit costs ~3.5s of latency and
 * there are a thousand of them; building both names into one staging tree and
 * sending it in a single parallel pass is the same work in a fraction of the
 * time. Rotation on a LATER change still uses the server-side copy, where it is
 * one object and the bytes are already there.
 */
export function seedPairs(storeRoot: string, spec: RemoteSpec, units: Unit[],
                          log: (s: string) => void = () => {}): number {
  const present = remoteKeys(spec);
  const need = units.filter(u => present.has(u.key) && !present.has(prevKey(u.key)));
  log(`${need.length} unit(s) need a .prev seeded`);
  if (!need.length) return 0;
  const stage = mkdtempSync(join(tmpdir(), 'records-seed-'));
  try {
    for (const u of need) buildUnitArchive(storeRoot, u, join(stage, prevKey(u.key)));
    execFileSync('rclone', ['copy', stage, spec.path, ...rcloneArgs(spec),
                            ...PIN, ...TRANSFERS],
                 { stdio: 'pipe', timeout: 3_600_000 });
    return need.length;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/** `a/b.tar.gz` -> `a/b.prev.tar.gz`, keeping the pair side by side. */
export function prevKey(key: string): string {
  return key.replace(/\.tar\.gz$/, '.prev.tar.gz');
}
