// The RUN ARCHIVE and the ledger, read from this side.
//
// WHY THIS EXISTS. Twenty-one rules were fed by python for one reason: python
// held the readers. The archive is JSON on disk and the ledger is JSON on disk;
// nothing about either needs python, and while it held them those rules could
// not SELF-ASSEMBLE -- so `auditContent.ts` could not run them at build time,
// where there is no python to ask.
//
// WHAT IS STILL PYTHON'S, and it is a real line rather than a tidy one: a rule
// whose SELF-TEST CASE injects by mutating a python object in memory must be
// fed by python, or the injection is invisible and the case tests nothing. That
// is not hypothetical -- `derived_fields_resolve` asked the runner to assemble
// from disk while the case patched `agreement.BLOCKS` in memory, answered
// clean, and reported NOTHING FIRED. `tools/injection_reach.py` is what says
// which rules are in that position.
//
// THE LEDGER IS THE INDEX, NOT A SECOND REGISTRY. An entry records the output
// DIRECTORY it was recorded from, so the artifact is findable without anything
// else being kept in step: `<out root>/<entry.out>/<item>.runs.json`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { outDir, rubricDir } from './courseData';

/** The recorded sides, in the ledger's own order. */
export const SIDES = ['olx', 'paper', 'paper_opus'] as const;
export const DEFAULT_SIDE = 'olx';

export type LedgerEntry = {
  out?: string; numerator?: number; denominator?: number;
  pending?: boolean; cells?: number; ask_sha?: string;
  prompt_sha?: string; scorer_sha?: string;
  excluded_cells?: Record<string, unknown>;
  recorded?: string; stamp?: string;
  [k: string]: unknown;
};

const memo = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  if (!memo.has(key)) memo.set(key, make());
  return memo.get(key) as T;
}

/** `<rubric>/MEASURED.json`, or an empty ledger when there is none. */
export function ledger(ns: string): { items: Record<string, Record<string, LedgerEntry>> } {
  return cached(`ledger:${ns}`, () => {
    const p = join(rubricDir(ns), 'MEASURED.json');
    if (!existsSync(p)) return { items: {} };
    try {
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      return { items: (doc?.items ?? {}) as Record<string, Record<string, LedgerEntry>> };
    } catch {
      return { items: {} };
    }
  });
}

/**
 * Where recorded artifacts live.
 *
 * `outDir` ALREADY EXISTED and this re-derived the same path from `rubricDir`.
 * Two spellings of one location is how they drift: the prepared accessor is
 * the one that gets fixed when the layout moves.
 */
export const outRoot = outDir;

/**
 * `{item: entry}` for ONE side, skipping items that side has no number for.
 *
 * Mirrors `measured.records`: every reader asks for a side rather than
 * indexing the raw ledger, so adding the side dimension did not mean auditing
 * every index expression for which of them meant "the web's number".
 */
export function records(ns: string, side: string = DEFAULT_SIDE): Record<string, LedgerEntry> {
  const out: Record<string, LedgerEntry> = {};
  for (const [item, rec] of Object.entries(ledger(ns).items ?? {})) {
    const got = (rec ?? {})[side];
    if (got) out[item] = got;
  }
  return out;
}

export function entry(ns: string, item: string, side: string = DEFAULT_SIDE): LedgerEntry {
  return ((ledger(ns).items ?? {})[item] ?? {})[side] ?? {};
}

/** The artifact path for one (item, side), or null when nothing is recorded. */
export function runsPath(ns: string, item: string, side: string = DEFAULT_SIDE): string | null {
  const out = entry(ns, item, side).out;
  if (!out) return null;
  const p = join(outRoot(ns), String(out), `${item}.runs.json`);
  return existsSync(p) ? p : null;
}

/**
 * The parsed runs artifact for one (item, side), read ONCE.
 *
 * CACHED ON (item, side), not on the path -- so a re-record during one process
 * is not picked up. That is correct here for the reason python records: every
 * caller is a read-only audit, and an artifact does not change under one.
 */
export function runsDoc(ns: string, item: string, side: string): Record<string, unknown> | null {
  return cached(`runs:${ns}:${item}:${side}`, () => {
    const p = runsPath(ns, item, side);
    if (!p) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  });
}

/** Every `results[]` entry across every run of one artifact. */
export function results(doc: Record<string, unknown> | null): Array<Record<string, unknown>> {
  const runs = (doc?.runs ?? []) as Array<Record<string, unknown>>;
  return runs.flatMap(r => (r?.results ?? []) as Array<Record<string, unknown>>);
}

/**
 * An artifact's era stamp for one item, PER ITEM first.
 *
 * The stamps moved into `era.items[<id>]` when they were scoped by primitive;
 * the top-level pair is the corpus-wide view and is read only as a fallback,
 * for artifacts written in between.
 */
export function eraStamp(doc: Record<string, unknown> | null,
                         item: string, field: string): string | null {
  const era = (doc?.era ?? {}) as Record<string, unknown>;
  const per = ((era.items ?? {}) as Record<string, Record<string, unknown>>)[item] ?? {};
  return (per[field] ?? era[field] ?? null) as string | null;
}


/**
 * Every `*.runs.json` under the out root, in BOTH LAYOUTS a sweep writes.
 *
 * A sweep driven by `--out foo` writes `foo/<item>.runs.json`; one driven by a
 * sweep script writes `foo/runs/<item>.runs.json`. Walking one level only is
 * how a check goes QUIET rather than wrong: a paper sweep of all 26 items
 * landed in the nested layout, correctly stamped, and the check that reads
 * those artifacts reported all 26 items unattributable -- the freshest
 * measurement on disk counted for nothing, because the only thing visible was
 * an undated directory from an earlier era.
 *
 * This side reproduced that bug on its first draft, which is why it is written
 * down here as well as in python: one level is the intuitive walk and the
 * wrong one.
 *
 * NOT the ledger's view. The ledger names the ONE artifact each column was
 * recorded from; a rule asking "does ANY recorded artifact contain X" has to
 * see the others too.
 */
export function runsFiles(ns: string): string[] {
  const root = outRoot(ns);
  if (!existsSync(root)) return [];
  const out = new Set<string>();
  const take = (dir: string) => {
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith('.runs.json')) out.add(join(dir, f));
      }
    } catch { /* a directory that vanished mid-walk is not a finding */ }
  };
  for (const entryName of readdirSync(root)) {
    const d = join(root, entryName);
    try {
      if (!statSync(d).isDirectory()) continue;
    } catch { continue; }
    take(d);                                   // foo/<item>.runs.json
    const nested = join(d, 'runs');
    try {
      if (statSync(nested).isDirectory()) take(nested);   // foo/runs/<item>.runs.json
    } catch { /* no nested layout here */ }
  }
  return [...out].sort();
}

/**
 * One result's answered values: the PICK fields first, then any verdict the
 * picks did not already answer.
 *
 * THE ORDER IS THE POINT. A python result stores a pick's value in `answers`
 * and an EMPTY STRING for the same key in `checks`, so reading verdicts first
 * would overwrite a real answer with nothing.
 */
export function resultValues(r: Record<string, unknown>): Record<string, unknown> {
  const a = (r.answers ?? r.refers_to ?? {}) as Record<string, unknown>;
  const v = (r.checks ?? r.verdicts ?? {}) as Record<string, unknown>;
  const values: Record<string, unknown> = { ...a };
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, y] of Object.entries(v)) {
      if (values[k] !== null && values[k] !== undefined) continue;
      values[k] = (y && typeof y === 'object' && !Array.isArray(y))
        ? (y as Record<string, unknown>).verdict : y;
    }
  }
  return values;
}


/**
 * Which program wrote this artifact: the three are told apart by SHAPE.
 *
 * Mirrors `measured._artifact_program`. THE LANGUAGE IS NOT THE DISCRIMINATOR
 * -- agreement.py and score.py are both Python, so a contract demanding
 * "python" would accept a paper-scorer artifact into a web column. What
 * separates them is the PROMPT SOURCE.
 *
 * Verified against python across the whole archive: 4366 artifacts, 0
 * mismatches, every decision path witnessed by real data -- 405 olx_app, 501
 * olx_python, 117 rubric_python via the folded branch, 3323 via the no-runs
 * path and 20 reaching the empty answer.
 */
export function artifactProgram(doc: Record<string, unknown>): string {
  if (!('runs' in doc)) {
    if ('items' in doc || 'scored_total' in doc) return 'rubric_python';
    return '';
  }
  for (const run of (doc.runs as Array<Record<string, unknown>> ?? [])) {
    for (const r of ((run?.results as Array<Record<string, unknown>>) ?? [])) {
      // score.py FOLDED by paper_runs.py grows a `runs` array, so the no-runs
      // test above cannot see it, and its results are keyed neither `cell` nor
      // `participant_id`. Without this branch a folded paper artifact returned
      // '' -- and '' SKIPS the program check, so the shape most likely to be
      // filed under the wrong side was the one nothing objected to.
      if ('credit_checks' in r || ('_pid' in r && 'item_id' in r)) return 'rubric_python';
      if ('cell' in r) return 'olx_app';
      if ('participant_id' in r) return 'olx_python';
    }
  }
  return '';
}

/**
 * Which program may write each column, and which model.
 *
 * THE SHAPE IS UNIFORM -- a tuple of programs even where there is one. python's
 * table was polymorphic (a tuple for the web column, a bare string for the
 * paper ones) and that CONCEALED a live defect: a comparison written as
 * `!=` against the field worked for the paper columns and silently skipped
 * every web candidate. Keeping one shape here means the same mistake would
 * fail on all three at once.
 */
export const SIDE_CONTRACT: Record<string, { programs: string[]; model: string }> = {
  olx: { programs: ['olx_app', 'olx_python'], model: 'gpt-5-mini' },
  paper: { programs: ['rubric_python'], model: 'gpt-5-mini' },
  paper_opus: { programs: ['rubric_python'], model: 'opus' },
};

/** The artifact programs admissible for `side`. python's `measured.want_shapes`. */
export function wantShapes(side: string): string[] {
  return SIDE_CONTRACT[side]?.programs ?? [];
}
