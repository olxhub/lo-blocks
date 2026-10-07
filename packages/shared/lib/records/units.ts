// packages/shared/lib/records/units.ts
//
// The ARCHIVE UNITS of a course's record store.
//
// A unit is the smallest thing worth uploading on its own, and the store splits
// by MUTABILITY rather than by directory:
//
//   ADD-ONLY   a run DIRECTORY under derived/out/ -> one .tar.gz for the whole
//              directory. Runs are added, never revised, so each is uploaded
//              once and never again.
//   PER FILE   every other file -> its own .tar.gz at the MIRRORED path.
//
// BOTH ARE .tar.gz, including the single-file ones, where the obvious choice is
// a bare .gz and the name says "zip". A gzip of one file carries no name, no
// mode and no directory, so restore would have to rebuild all three from the
// object's path and would silently drop an executable bit. See archive.ts.
//
// WHY PER FILE. An edit to GOALS.md must cost GOALS.md compressed and nothing
// else. Bundling a directory's fixed-name files into one archive would charge
// 7.23 MB of pinned, unfreeable revision for a one-line edit, every time.
// Measured on this store: 1,114 objects -- 973 add-only, 141 per-file.
//
// "ADD-ONLY" IS HOW THE TREE IS USED, NOT A GUARANTEE THE FILESYSTEM MAKES.
// Every unit is hashed, add-only included. If a run's bytes ever do change its
// hash moves, the object is rewritten, and Drive's revisions hold the older one.
// The hash is also what makes a no-op snapshot cost one listing instead of
// 1,114 uploads.
import { createHash } from 'crypto';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

export type UnitKind = 'addonly' | 'perfile';

export interface Unit {
  /** Remote object path, mirroring the local tree. POSIX separators always. */
  key: string;
  kind: UnitKind;
  /** Absolute path of the directory (add-only) or file (per-file) it archives. */
  source: string;
  /** Every file it contains, sorted. */
  files: string[];
  bytes: number;
}

/** Every file under `dir`, sorted, so a hash does not depend on readdir order. */
export function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let names: string[];
    try { names = readdirSync(d).sort(); } catch { return; }
    for (const n of names) {
      const p = join(d, n);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * A unit's content hash: file NAMES and BYTES, nothing else.
 *
 * NOT the archive's own bytes. gzip embeds a timestamp, so hashing the archive
 * makes every run look like a change and uploads the world nightly -- the exact
 * churn this module exists to prevent. NOT mtimes, for the same reason. Names
 * are in because a rename is a change even when every byte survives.
 */
export function unitHash(base: string, files: string[]): string {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(base, f).split(sep).join('/'));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex');
}

const posix = (p: string) => p.split(sep).join('/');

/**
 * The units of one `<kind>/<id>` directory.
 *
 * `derived/out` IS FOUND BY NAME. A store that keeps its runs elsewhere simply
 * has no add-only units, rather than having the wrong ones -- guessing "the
 * biggest directory" would be a rule nobody wrote down and nobody could predict.
 */
export function unitsFor(storeRoot: string, kind: string, id: string): Unit[] {
  const base = join(storeRoot, kind, id);
  const outDir = join(base, 'derived', 'out');
  const units: Unit[] = [];
  const claimed = new Set<string>();

  let entries: string[] = [];
  try { entries = readdirSync(outDir).sort(); } catch { /* no out/ */ }

  for (const name of entries) {
    const p = join(outDir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;           // loose files are per-file units
    const files = filesUnder(p);
    if (!files.length) continue;
    files.forEach(f => claimed.add(f));
    units.push({
      key: `${posix(relative(storeRoot, p))}.tar.gz`,
      kind: 'addonly', source: p, files,
      bytes: files.reduce((n, f) => n + statSync(f).size, 0),
    });
  }

  for (const f of filesUnder(base)) {
    if (claimed.has(f)) continue;
    units.push({
      key: `${posix(relative(storeRoot, f))}.tar.gz`,
      kind: 'perfile', source: f, files: [f],
      bytes: statSync(f).size,
    });
  }
  return units;
}

/**
 * The units of the store ROOT: its loose files, one archive each.
 *
 * `corpus_refs.json` LIVES HERE, owned by neither an instrument nor a rubric,
 * and every build of every course resolving a corpus reference reads it. It is
 * not reached by `unitsFor`, which only ever walks `<kind>/<id>`, so before this
 * existed the root was the one part of the store the archive could not see --
 * and a clone restored all 1,082 course objects, then failed to build on the one
 * 192 KB file nothing had uploaded. The cloned-course test is what found it;
 * no install that already had the file could have.
 *
 * DEPTH ONE, FILES ONLY. `instruments/`, `rubrics/` and `.archive/` are
 * directories and are skipped by that alone -- the first two have their own
 * units and the third is the bookkeeping, which must never archive itself.
 */
export function rootUnits(storeRoot: string): Unit[] {
  const units: Unit[] = [];
  let names: string[] = [];
  try { names = readdirSync(storeRoot).sort(); } catch { return units; }
  for (const n of names) {
    const p = join(storeRoot, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    units.push({ key: `${n}.tar.gz`, kind: 'perfile', source: p, files: [p], bytes: st.size });
  }
  return units;
}

/** Every `<kind>/<id>` in a store, as `[kind, id]`. */
export function storeDirs(storeRoot: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const kind of ['instruments', 'rubrics']) {
    let ids: string[] = [];
    try { ids = readdirSync(join(storeRoot, kind)).sort(); } catch { continue; }
    for (const id of ids) {
      try { if (statSync(join(storeRoot, kind, id)).isDirectory()) out.push([kind, id]); }
      catch { /* skip */ }
    }
  }
  return out;
}
