#!/usr/bin/env npx tsx
// src/scripts/replay.ts
//
// Replay event logs through Redux reducers — pure, no side effects.
//
// Reads a JSON event log captured from the browser (via __events.download()),
// replays it through updateResponseReducer, and outputs the resulting state.
// Useful for debugging, analytics, and test case generation.
//
// Usage:
//   npx tsx scripts/replay.ts events.json                 # Pretty-print final state
//   npx tsx scripts/replay.ts events.json --json          # Raw JSON (pipe to jq)
//   npx tsx scripts/replay.ts events.json --json | jq '.storage'
//   npx tsx scripts/replay.ts events.json --step          # Show each event's effect
//   npx tsx scripts/replay.ts events.json --query storage # Show one scope
//   npx tsx scripts/replay.ts events.json --query 'component["id"].value'
//   npx tsx scripts/replay.ts events.json -v              # Verbose event list
//   cat events.json | npx tsx scripts/replay.ts --json    # Read from stdin
//
// Event log format: { "description": "...", "events": [ { "event": "...", ... }, ... ] }
// Captured in browser: __events.download() or JSON.parse(JSON.stringify(__events.getEvents()))
//

import * as fs from 'fs';
import * as path from 'path';

import {
  replayToEvent,
  replayWithSnapshots,
  diffStates,
  AppState,
  LoggedEvent,
} from '../lib/replay';

// =============================================================================
// Event log loading
// =============================================================================

interface EventLog {
  description?: string;
  events: LoggedEvent[];
}

function loadEventLog(filePath: string): EventLog {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return parseEventLog(content);
}

function loadFromStdin(): Promise<EventLog> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      try { resolve(parseEventLog(data)); }
      catch (e) { reject(e); }
    });
    process.stdin.on('error', reject);
  });
}

function parseEventLog(content: string): EventLog {
  const parsed = JSON.parse(content);
  // Accept both { events: [...] } and bare [...]
  if (Array.isArray(parsed)) return { events: parsed };
  if (parsed.events) return parsed;
  throw new Error('Expected { events: [...] } or a bare event array');
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
  printScope('chat', state.chat);

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

    // Show what changed
    const changes: string[] = [];
    for (const id of diff.component.added) changes.push(`  + component.${id}: ${JSON.stringify(state.component[id])}`);
    for (const id of diff.component.changed) changes.push(`  ~ component.${id}: ${JSON.stringify(state.component[id])}`);
    for (const id of diff.component.removed) changes.push(`  - component.${id}`);
    for (const key of diff.system.changed) changes.push(`  ~ system.${key}: ${JSON.stringify(state.system[key])}`);

    // diffStates doesn't cover storage/componentSetting — add those
    const prevStorage = prev.storage ?? {};
    const curStorage = state.storage ?? {};
    for (const id of Object.keys(curStorage)) {
      if (!prevStorage[id]) {
        changes.push(`  + storage.${id}: ${JSON.stringify(curStorage[id])}`);
      } else if (JSON.stringify(prevStorage[id]) !== JSON.stringify(curStorage[id])) {
        changes.push(`  ~ storage.${id}: ${JSON.stringify(curStorage[id])}`);
      }
    }
    for (const id of Object.keys(prevStorage)) {
      if (!curStorage[id]) changes.push(`  - storage.${id}`);
    }

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

async function main() {
  const args = process.argv.slice(2);

  const verbose = args.includes('--verbose') || args.includes('-v');
  const json = args.includes('--json');
  const step = args.includes('--step');
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
    eventLog = loadEventLog(fileArg);
  } else if (!process.stdin.isTTY) {
    eventLog = await loadFromStdin();
  } else {
    console.log(`Usage: npx tsx scripts/replay.ts [options] <event-log.json>

Options:
  --json       Output raw JSON state (pipe to jq for queries)
  --step       Show each event and its state changes
  --query PATH Show a specific path (e.g., "storage", 'component["id"]')
  -v           List each event during replay

Examples:
  npx tsx scripts/replay.ts events.json
  npx tsx scripts/replay.ts events.json --json | jq '.storage'
  npx tsx scripts/replay.ts events.json --step
  npx tsx scripts/replay.ts events.json --query storage
  cat events.json | npx tsx scripts/replay.ts --json

Capture events in browser:
  __events.download()           // saves events.json
  __events.json()               // copy from console
`);
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
