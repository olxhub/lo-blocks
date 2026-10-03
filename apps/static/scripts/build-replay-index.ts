#!/usr/bin/env tsx
// apps/static/scripts/build-replay-index.ts
//
// Builds the static replay-data payload consumed by the /replay/ viewer.
//
// The viewer is teacher-facing and organised as:  run -> student -> session.
// A "run" is one deployment (e.g. the psych pilot, or the child-defiance
// course). Each run has its own event logs AND its own course content JSON
// (the pilot ran a different course than the current branch, so content is
// per-run, not global).
//
// For each run this script:
//   1. Scans an events directory of per-connection NDJSON logs.
//   2. Groups connection logs by student (safe_user_id).
//   3. Merges each student's connections into one timestamp-ordered stream
//      (no dedupe — see sessions.ts) and splits it into work sessions by
//      inactivity gap.
//   4. Emits, per student, one merged .jsonl.gz; the index records session
//      boundaries as event-count ranges into that merged stream.
//
// Output layout (under <out>/replay-data/):
//   runs.json                     -- list of runs (id, label, counts)
//   runs/<run>/index.json         -- students -> sessions manifest
//   runs/<run>/content.json       -- course content ({ idMap, ok }) for LOAD_OLXJSON
//   runs/<run>/logs/<user>.jsonl.gz -- merged, sorted per-student event stream
//
// The viewer is pure-static: it fetches these files and parses/replays them in
// the browser (DecompressionStream). No server code.
//
// Usage (repeatable --run / --events / --content triples):
//   tsx apps/static/scripts/build-replay-index.ts --out dist/psych \
//     --run psych-defiance --events <dir> --content <all.json> \
//     --run psych-pilot    --events <dir> --content <all.json>
//
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import { parseNDJSON } from '../src/replay/parseLog';
import type { LoggedEvent } from '@/lib/replay';
import {
  sortEventsByTime,
  splitIntoSessions,
  type StudentEntry,
  type SessionEntry,
  type RunIndex,
  type RunSummary,
} from '../src/replay/sessions';
import {
  DEFAULT_RESPONSE_FIELDS,
  SESSION_COLUMNS,
  csvDocument,
  responsesHeader,
  responseRow,
  sessionRows,
} from '../src/replay/responses';

export type { RunIndex, RunSummary };

// ---------------------------------------------------------------------------
// CLI: collect repeatable --run/--events/--content triples in order.
// ---------------------------------------------------------------------------

interface RunSpec {
  id: string;
  label?: string;
  eventsDir: string;
  contentFile: string;
  /** Optional per-run override of the response-CSV field list. */
  fields?: string[];
}

function parseArgs(argv: string[]): { out?: string; runs: RunSpec[] } {
  const runs: RunSpec[] = [];
  let out: string | undefined;
  let cur: Partial<RunSpec> | null = null;

  const flush = () => {
    if (!cur) return;
    if (!cur.id || !cur.eventsDir || !cur.contentFile) {
      throw new Error(
        `Incomplete --run "${cur.id ?? '?'}": each run needs --run, --events, --content.`,
      );
    }
    runs.push(cur as RunSpec);
    cur = null;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--out': out = next(); break;
      case '--run': flush(); cur = { id: next() }; break;
      case '--label': if (cur) cur.label = next(); break;
      case '--events': if (cur) cur.eventsDir = next(); break;
      case '--content': if (cur) cur.contentFile = next(); break;
      case '--fields':
        if (cur) cur.fields = next().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      default: break;
    }
  }
  flush();
  return { out, runs };
}

// ---------------------------------------------------------------------------
// Per-run build (pure — returns data + files to write; testable)
// ---------------------------------------------------------------------------

export interface StudentMergedLog {
  safeUserId: string;
  /** Merged, timestamp-ordered replay events for the whole student. */
  events: LoggedEvent[];
}

/**
 * Read every connection log in `eventsDirAbs`, group by student, merge + sort,
 * and split into work sessions. Returns the run index plus each student's
 * merged event stream (to be written as one .jsonl.gz).
 */
export function buildRun(runId: string, label: string, eventsDirAbs: string): {
  index: RunIndex;
  merged: StudentMergedLog[];
} {
  const entries = fs
    .readdirSync(eventsDirAbs)
    .filter((f) => f.endsWith('.jsonl') || f.endsWith('.jsonl.gz'))
    .sort();

  // Collect per-student: raw replay events (across all connections) + identity.
  interface Acc { safeUserId: string; userId: string; events: LoggedEvent[]; seed: number | null; }
  const byStudent = new Map<string, Acc>();

  for (const name of entries) {
    const sourcePath = path.join(eventsDirAbs, name);
    let text: string;
    try {
      const buf = fs.readFileSync(sourcePath);
      text = name.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf-8') : buf.toString('utf-8');
    } catch (e) {
      console.warn(`  skipping ${name}: ${(e as Error).message}`);
      continue;
    }

    const log = parseNDJSON(text, name);
    const u = log.header?.user;
    const safeUserId = u?.safe_user_id ?? u?.user_id ?? 'unknown';
    const userId = u?.user_id ?? safeUserId;

    let acc = byStudent.get(safeUserId);
    if (!acc) {
      acc = { safeUserId, userId, events: [], seed: null };
      byStudent.set(safeUserId, acc);
    }
    // Seed the ordering clock with the earliest header start we see.
    const startMs = log.header?.started ? new Date(log.header.started).getTime() : null;
    if (startMs != null && Number.isFinite(startMs)) {
      acc.seed = acc.seed == null ? startMs : Math.min(acc.seed, startMs);
    }
    acc.events.push(...log.replayEvents);
  }

  const students: StudentEntry[] = [];
  const merged: StudentMergedLog[] = [];

  for (const acc of byStudent.values()) {
    const sorted = sortEventsByTime(acc.events, acc.seed);
    const split = splitIntoSessions(sorted);

    const sessions: SessionEntry[] = split.map((s) => s.entry);
    const totalEventCount = sorted.length;
    const totalDurationMs = sessions.reduce((n, s) => n + s.durationMs, 0);
    const totalActiveMs = sessions.reduce((n, s) => n + s.activeMs, 0);
    const lastActive = sessions.length ? sessions[sessions.length - 1].ended : null;

    students.push({
      safeUserId: acc.safeUserId,
      userId: acc.userId,
      sessions,
      totalEventCount,
      totalDurationMs,
      totalActiveMs,
      lastActive,
    });
    merged.push({ safeUserId: acc.safeUserId, events: sorted });
  }

  students.sort((a, b) => a.safeUserId.localeCompare(b.safeUserId));

  const index: RunIndex = {
    id: runId,
    label,
    generatedAt: new Date().toISOString(),
    students,
  };
  return { index, merged };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/** Sanitize a safe_user_id for use as a filename (defensive; already safe). */
function fileNameForUser(safeUserId: string): string {
  return safeUserId.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Replay every student to final state and write responses.csv + sessions.csv
 * into `runDir`. Replaying pulls in the real reducer stack, so we import it
 * lazily here (its module-load `initReducers` side effect stays out of the pure
 * grouping tests). Reports, for the caller's summary, which requested fields
 * were never populated by any student in the run.
 */
async function emitResponseCsvs(
  runDir: string,
  index: RunIndex,
  merged: StudentMergedLog[],
  fields: string[],
): Promise<{ missingFields: string[] }> {
  const { replayToFinalState } = await import('../src/replay/replayResponses');
  const { extractResponseField } = await import('../src/replay/responses');

  const eventsById = new Map(merged.map((m) => [m.safeUserId, m.events]));

  const responseRowsAll: unknown[][] = [];
  const sessionRowsAll: unknown[][] = [];
  const populated = new Set<string>();

  // Iterate in the index's (safeUserId-sorted) order for stable CSV output.
  for (const student of index.students) {
    const events = eventsById.get(student.safeUserId) ?? [];
    const state = replayToFinalState(events);
    responseRowsAll.push(responseRow(student, state, fields));
    sessionRowsAll.push(...sessionRows(student));
    for (const f of fields) {
      if (extractResponseField(state, f) !== '') populated.add(f);
    }
  }

  fs.writeFileSync(
    path.join(runDir, 'responses.csv'),
    csvDocument(responsesHeader(fields), responseRowsAll),
  );
  fs.writeFileSync(
    path.join(runDir, 'sessions.csv'),
    csvDocument([...SESSION_COLUMNS], sessionRowsAll),
  );

  const missingFields = fields.filter((f) => !populated.has(f));
  return { missingFields };
}

async function main() {
  const { out, runs } = parseArgs(process.argv.slice(2));

  if (!out || runs.length === 0) {
    console.error(
      'Usage: build-replay-index.ts --out <distDir> \\\n' +
      '         --run <id> [--label <text>] --events <dir> --content <all.json> [more runs...]',
    );
    process.exit(1);
  }

  const outDirAbs = path.resolve(out);
  if (!fs.existsSync(outDirAbs)) {
    console.error(`Output dir not found: ${outDirAbs} (build the site first).`);
    process.exit(1);
  }

  console.log('=== build-replay-index ===');
  console.log(`  Output: ${outDirAbs}`);
  console.log(`  Runs:   ${runs.map((r) => r.id).join(', ')}`);

  const dataDir = path.join(outDirAbs, 'replay-data');
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const summaries: RunSummary[] = [];

  for (const run of runs) {
    const eventsDirAbs = path.resolve(run.eventsDir);
    const contentAbs = path.resolve(run.contentFile);
    const label = run.label ?? run.id;

    if (!fs.existsSync(eventsDirAbs)) {
      console.error(`  [${run.id}] events dir not found: ${eventsDirAbs}`);
      process.exit(1);
    }
    if (!fs.existsSync(contentAbs)) {
      console.error(`  [${run.id}] content file not found: ${contentAbs}`);
      process.exit(1);
    }

    console.log(`\n--- run ${run.id} ---`);
    console.log(`  Events:  ${eventsDirAbs}`);
    console.log(`  Content: ${contentAbs}`);

    const { index, merged } = buildRun(run.id, label, eventsDirAbs);

    const runDir = path.join(dataDir, 'runs', run.id);
    const logsDir = path.join(runDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Per-student merged, sorted, gzipped NDJSON.
    for (const m of merged) {
      const lines = m.events.map((e) => JSON.stringify(e)).join('\n');
      const gz = zlib.gzipSync(Buffer.from(lines, 'utf-8'));
      fs.writeFileSync(path.join(logsDir, `${fileNameForUser(m.safeUserId)}.jsonl.gz`), gz);
    }

    fs.writeFileSync(path.join(runDir, 'index.json'), JSON.stringify(index, null, 2));
    // Course content: copy verbatim ({ idMap, ok }).
    fs.copyFileSync(contentAbs, path.join(runDir, 'content.json'));

    // Response-data CSVs: replay each student to final state, extract fields.
    const fields = run.fields ?? [...DEFAULT_RESPONSE_FIELDS];
    const { missingFields } = await emitResponseCsvs(runDir, index, merged, fields);
    if (missingFields.length) {
      console.warn(`  [${run.id}] response fields never populated by any student (empty column kept): ${missingFields.join(', ')}`);
    }

    const sessionCount = index.students.reduce((n, s) => n + s.sessions.length, 0);
    const totalActiveMs = index.students.reduce((n, s) => n + s.totalActiveMs, 0);
    summaries.push({ id: run.id, label, studentCount: index.students.length, sessionCount, totalActiveMs, hasResponses: true });
    console.log(`  ${index.students.length} students, ${sessionCount} sessions, ${merged.length} merged logs, responses.csv (${fields.length} fields) + sessions.csv.`);
  }

  fs.writeFileSync(
    path.join(dataDir, 'runs.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), runs: summaries }, null, 2),
  );

  // Install the viewer at / for convenience (asset paths are absolute).
  const replayHtml = path.join(outDirAbs, 'replay', 'index.html');
  if (fs.existsSync(replayHtml)) {
    fs.copyFileSync(replayHtml, path.join(outDirAbs, 'index.html'));
    console.log('\n  Viewer installed at / (index.html overwritten).');
  }

  console.log(`\n=== done: ${dataDir} ===`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Error:', (err as Error).message ?? err);
    process.exit(1);
  });
}
