#!/usr/bin/env npx tsx
// packages/shared/scripts/replay.ts
//
// Replay event logs through Redux reducers — pure, no side effects.
//
// Reads event logs in two formats:
//   - NDJSON (.jsonl or .jsonl.gz): one JSON object per line, as written by the
//     server's eventLog.ts. The first line is a header with { description, started,
//     user }; subsequent lines are events. This is the primary format.
//   - Wrapped JSON (--unwrap): { "events": [...] } as downloaded from the browser
//     via __events.download() or the debug panel (ctrl-`).
//
// .gz files are automatically decompressed.
//
// Usage:
//   npx tsx scripts/replay.ts events.jsonl.gz             # Server log
//   npx tsx scripts/replay.ts events.jsonl.gz --json      # Raw JSON (pipe to jq)
//   npx tsx scripts/replay.ts events.json --unwrap        # Browser download
//   zcat events.jsonl.gz | npx tsx scripts/replay.ts      # Stdin (NDJSON)
//   cat events.json | npx tsx scripts/replay.ts --unwrap  # Stdin (wrapped)

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import {
  replayToEvent,
  replayWithSnapshots,
  diffStates,
  LoggedEvent,
} from '../lib/replay';
import type { AppState } from '../lib/types';

// =============================================================================
// Event log loading
// =============================================================================

interface EventLog {
  description?: string;
  events: LoggedEvent[];
}

/** Read file contents, decompressing .gz automatically. */
function readFile(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath);
  if (filePath.endsWith('.gz')) {
    return zlib.gunzipSync(raw).toString('utf-8');
  }
  return raw.toString('utf-8');
}

/** Parse NDJSON: one JSON object per line. Lines with event "ndjson_header"
 *  are treated as metadata; all other lines are events. */
function parseNDJSON(content: string): EventLog {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  let description: string | undefined;
  const events: LoggedEvent[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed.event === 'ndjson_header') {
      description = parsed.description;
    } else {
      events.push(parsed);
    }
  }
  return { description, events };
}

/** Parse wrapped JSON: { events: [...] } or bare [...]. */
function parseWrappedJSON(content: string): EventLog {
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return { events: parsed };
  if (Array.isArray(parsed.events)) return parsed;
  throw new Error('Expected { "events": [...] } or a bare event array');
}

function loadEventLog(filePath: string, unwrap: boolean): EventLog {
  const content = readFile(filePath);
  return unwrap ? parseWrappedJSON(content) : parseNDJSON(content);
}

function loadFromStdin(unwrap: boolean): Promise<EventLog> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', chunk => { chunks.push(chunk); });
    process.stdin.on('end', () => {
      try {
        const content = Buffer.concat(chunks).toString('utf-8');
        resolve(unwrap ? parseWrappedJSON(content) : parseNDJSON(content));
      } catch (e) { reject(e); }
    });
    process.stdin.on('error', reject);
  });
}

// =============================================================================
// State display
// =============================================================================

/** Print a scope's contents. Skips empty scopes unless forced. */
function printScope(label: string, data: Record<string, any>, indent = '  ') {
  if (!data || Object.keys(data).length === 0) return;
  console.log(`${label}:`);
  for (const [key, value] of Object.entries(data)) {
    const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Truncate long values for readability
    const display = val.length > 200 ? val.slice(0, 197) + '...' : val;
    console.log(`${indent}${key}: ${display}`);
  }
  console.log();
}

function printOlxSummary(olxjson: Record<string, any>) {
  if (!olxjson || Object.keys(olxjson).length === 0) return;
  console.log('olxjson:');
  for (const [source, blocks] of Object.entries(olxjson)) {
    const blockIds = Object.keys(blocks as object);
    console.log(`  ${source}: ${blockIds.length} blocks`);
    for (const id of blockIds) {
      const entry = (blocks as any)[id];
      console.log(`    - ${id} (${entry.olxJson?.tag || entry.tag || '?'})`);
    }
  }
  console.log();
}

function printState(state: AppState) {
  console.log('\n=== Final State ===\n');
  printOlxSummary(state.olxjson);
  printScope('component', state.component);
  printScope('storage', state.storage);
  printScope('componentSetting', state.componentSetting);
  printScope('system', state.system);

  // Summary line
  const counts = {
    olxSources: Object.keys(state.olxjson ?? {}).length,
    components: Object.keys(state.component ?? {}).length,
    storage: Object.keys(state.storage ?? {}).length,
    settings: Object.keys(state.componentSetting ?? {}).length,
  };
  const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  if (parts.length > 0) console.log(`Totals: ${parts.join(', ')}`);
}

/** Print event summary — count of each event type. */
function printEventSummary(events: LoggedEvent[]) {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.event] = (counts[e.event] ?? 0) + 1;
  }
  console.log('Event types:');
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log();
}

// =============================================================================
// Step-by-step replay
// =============================================================================

function replayStep(events: LoggedEvent[]) {
  const snapshots = replayWithSnapshots(events);

  for (let i = 1; i < snapshots.length; i++) {
    const { event, state } = snapshots[i];
    const prev = snapshots[i - 1].state;
    const diff = diffStates(prev, state);

    const parts: string[] = [];
    if (event!.id) parts.push(`id=${event!.id}`);
    if (event!.scope && event!.scope !== 'component') parts.push(`scope=${event!.scope}`);
    const extra = parts.length > 0 ? ` (${parts.join(', ')})` : '';

    console.log(`[${i}/${events.length}] ${event!.event}${extra}`);

    // Show what changed — diffStates covers all scopes
    const changes: string[] = [];
    for (const scope of ['component', 'storage', 'componentSetting'] as const) {
      const scopeDiff = diff[scope];
      const scopeState = state[scope] ?? {};
      for (const id of scopeDiff.added) changes.push(`  + ${scope}.${id}: ${JSON.stringify(scopeState[id])}`);
      for (const id of scopeDiff.changed) changes.push(`  ~ ${scope}.${id}: ${JSON.stringify(scopeState[id])}`);
      for (const id of scopeDiff.removed) changes.push(`  - ${scope}.${id}`);
    }
    for (const key of diff.system.changed) changes.push(`  ~ system.${key}: ${JSON.stringify(state.system[key])}`);

    if (changes.length > 0) {
      for (const c of changes) console.log(c);
    }
  }
}

// =============================================================================
// Query
// =============================================================================

/**
 * Resolve a simple dot/bracket path against state.
 * Supports: "storage", "component", "storage.foo", 'component["id.with.dots"].field'
 */
function resolvePath(state: any, query: string): any {
  // Parse bracket and dot notation: component["foo.bar"].value → ['component', 'foo.bar', 'value']
  const segments: string[] = [];
  let i = 0;
  while (i < query.length) {
    if (query[i] === '[') {
      // Bracket notation — find closing bracket
      const quote = query[i + 1];
      if (quote === '"' || quote === "'") {
        const end = query.indexOf(quote + ']', i + 2);
        if (end === -1) throw new Error(`Unclosed bracket at position ${i}`);
        segments.push(query.slice(i + 2, end));
        i = end + 2;
      } else {
        const end = query.indexOf(']', i + 1);
        if (end === -1) throw new Error(`Unclosed bracket at position ${i}`);
        segments.push(query.slice(i + 1, end));
        i = end + 1;
      }
      if (query[i] === '.') i++; // skip trailing dot
    } else {
      // Dot notation — read until next dot or bracket
      const nextDot = query.indexOf('.', i);
      const nextBracket = query.indexOf('[', i);
      let end: number;
      if (nextDot === -1 && nextBracket === -1) end = query.length;
      else if (nextDot === -1) end = nextBracket;
      else if (nextBracket === -1) end = nextDot;
      else end = Math.min(nextDot, nextBracket);
      segments.push(query.slice(i, end));
      i = end;
      if (query[i] === '.') i++;
    }
  }

  let result = state;
  for (const seg of segments) {
    if (result == null) return undefined;
    result = result[seg];
  }
  return result;
}

// =============================================================================
// Main
// =============================================================================

const USAGE = `Usage: npx tsx scripts/replay.ts [options] <event-log>

Replay event logs through Redux reducers to reconstruct application state.

Input formats:
  NDJSON (default)    Server logs from events/*.jsonl.gz. One JSON object per
                      line: header (metadata) followed by events.
  Wrapped (--unwrap)  Browser exports: { "events": [...] } or bare arrays.
                      Captured via __events.download() in the browser console,
                      or via the debug panel (ctrl-\`).

  .gz files are decompressed automatically.

Options:
  --unwrap       Parse as wrapped JSON ({ events: [...] }) instead of NDJSON
  --json         Output raw JSON state (pipe to jq for queries)
  --step         Show each event and its state changes
  --query PATH   Show a specific path (e.g., "storage", 'component["id"]')
  -v, --verbose  List each event during replay
  --help         Show this help

Examples:
  npx tsx scripts/replay.ts events/session.jsonl.gz
  npx tsx scripts/replay.ts events/session.jsonl.gz --json | jq '.storage'
  npx tsx scripts/replay.ts events/session.jsonl.gz --step
  npx tsx scripts/replay.ts events/session.jsonl.gz --query storage
  npx tsx scripts/replay.ts debug-events.json --unwrap
  zcat events/session.jsonl.gz | npx tsx scripts/replay.ts
  cat debug-events.json | npx tsx scripts/replay.ts --unwrap
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  const verbose = args.includes('--verbose') || args.includes('-v');
  const json = args.includes('--json');
  const step = args.includes('--step');
  const unwrap = args.includes('--unwrap');
  const queryIdx = args.indexOf('--query');
  const queryArg = queryIdx !== -1 ? args[queryIdx + 1] : null;

  // Non-flag args (skip the value after --query)
  const positionalArgs = args.filter((a, i) =>
    !a.startsWith('-') && (queryIdx === -1 || i !== queryIdx + 1)
  );
  const fileArg = positionalArgs[0];

  // Load events
  let eventLog: EventLog;
  if (fileArg) {
    eventLog = loadEventLog(fileArg, unwrap);
  } else if (!process.stdin.isTTY) {
    eventLog = await loadFromStdin(unwrap);
  } else {
    console.log(USAGE);
    process.exit(1);
  }

  if (eventLog.description) {
    console.error(`${eventLog.description}`);
  }
  console.error(`Replaying ${eventLog.events.length} events...`);

  // Step mode: show event-by-event changes
  if (step) {
    replayStep(eventLog.events);
    return;
  }

  // Verbose: list events
  if (verbose) {
    for (let i = 0; i < eventLog.events.length; i++) {
      const e = eventLog.events[i];
      const parts = [e.id && `id=${e.id}`, e.scope && `scope=${e.scope}`].filter(Boolean).join(' ');
      console.error(`  [${i + 1}] ${e.event} ${parts}`);
    }
  }

  // Replay
  const state = replayToEvent(eventLog.events);

  // JSON mode
  if (json) {
    const output = queryArg ? resolvePath(state, queryArg) : state;
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Query mode
  if (queryArg) {
    const result = resolvePath(state, queryArg);
    if (result === undefined) {
      console.log(`${queryArg}: undefined`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  // Default: pretty print
  printEventSummary(eventLog.events);
  printState(state);
}

main().then(
  () => process.exit(0),
  err => { console.error('Error:', err.message ?? err); process.exit(1); },
);
