#!/usr/bin/env npx tsx
// src/scripts/replay.ts
//
// Replay event logs through Redux reducers.
//
// Usage:
//   npx tsx src/scripts/replay.ts src/scripts/fixtures/grading-session.json
//   npx tsx src/scripts/replay.ts --verbose src/scripts/fixtures/grading-session.json
//
// This script:
// 1. Loads an event log (JSON file with { events: [...] })
// 2. Replays events through the Redux reducer (pure, no side effects)
// 3. Outputs final state and can query specific values
//
// Uses the pure replay module from src/lib/replay.ts - no lo_event required.
//

import * as fs from 'fs';
import * as path from 'path';

// Use the pure replay module - no side effects, no lo_event
import { replayToEvent, replayWithSnapshots, AppState, LoggedEvent } from '../lib/replay';
import { commonFields } from '../lib/state/commonFields';

interface EventLog {
  description?: string;
  events: LoggedEvent[];
}

function loadEventLog(filePath: string): EventLog {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return JSON.parse(content);
}

let verbose = false;

function replayEvents(events: LoggedEvent[]): AppState {
  console.log(`Replaying ${events.length} events...`);

  if (verbose) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`[${i + 1}/${events.length}] ${event.event}`,
        event.id ? `id=${event.id}` : '',
        event.source ? `source=${event.source}` : ''
      );
    }
  }

  // Use pure replay - no side effects
  return replayToEvent(events);
}

function printState(state: AppState) {
  console.log('\n=== Final State ===\n');

  // Print olxjson content summary
  if (state.olxjson && Object.keys(state.olxjson).length > 0) {
    console.log('OLX Content:');
    for (const [source, blocks] of Object.entries(state.olxjson)) {
      const blockIds = Object.keys(blocks as object);
      console.log(`  ${source}: ${blockIds.length} blocks`);
      for (const id of blockIds) {
        const entry = (blocks as any)[id];
        console.log(`    - ${id} (${entry.olxJson?.tag || 'unknown'})`);
      }
    }
    console.log();
  }

  // Print component state
  if (state.component && Object.keys(state.component).length > 0) {
    console.log('Component State:');
    for (const [id, fields] of Object.entries(state.component)) {
      console.log(`  ${id}:`, JSON.stringify(fields));
    }
    console.log();
  }

  // Print system state
  if (state.system && Object.keys(state.system).length > 0) {
    console.log('System State:', JSON.stringify(state.system));
    console.log();
  }
}

function queryValues(state: AppState, queries: string[]) {
  console.log('=== Queries ===\n');

  for (const query of queries) {
    // Simple query format: field:id (e.g., "value:input1" or "correct:grader1")
    const [fieldName, id] = query.split(':');

    const field = (commonFields as any)[fieldName];
    if (!field) {
      console.log(`  ${query}: unknown field "${fieldName}"`);
      continue;
    }

    // Direct lookup in component state
    const value = state.component[id]?.[fieldName];
    console.log(`  ${query}: ${JSON.stringify(value)}`);
  }
}

// Main
const args = process.argv.slice(2);
verbose = args.includes('--verbose') || args.includes('-v');
const fileArg = args.find(a => !a.startsWith('-'));

if (!fileArg) {
  console.log('Usage: npx tsx src/scripts/replay.ts [--verbose] <event-log.json>');
  console.log('\nExample:');
  console.log('  npx tsx src/scripts/replay.ts src/scripts/fixtures/grading-session.json');
  process.exit(1);
}

try {
  const eventLog = loadEventLog(fileArg);

  if (eventLog.description) {
    console.log(`\n${eventLog.description}\n`);
  }

  // Pure replay - no side effects, no lo_event
  const finalState = replayEvents(eventLog.events);
  printState(finalState);

  // Query common grading values
  queryValues(finalState, [
    'value:NumericalGraderBasic.input',
    'correct:NumericalGraderBasic.grader',
    'submitCount:NumericalGraderBasic.grader'
  ]);

  // No explicit exit needed - pure replay has no async operations

} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
