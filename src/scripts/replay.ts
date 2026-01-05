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
// 2. Replays events through the Redux reducer
// 3. Outputs final state and can query specific values
//

// Suppress lo_event console noise unless verbose
const originalConsoleLog = console.log;
let verbose = false;
console.log = (...args) => {
  const msg = args[0]?.toString() || '';
  // Filter out lo_event noise
  if (!verbose && (
    msg.includes('info,') ||
    msg.includes('setField:') ||
    msg.includes('Initializing console') ||
    msg.includes('browser_info') ||
    msg.includes('Event consumption')
  )) {
    return;
  }
  originalConsoleLog(...args);
};

import * as fs from 'fs';
import * as path from 'path';

// Use the existing store infrastructure
import { store } from '../lib/state/store';
import { fieldSelector } from '../lib/state/redux';
import { commonFields } from '../lib/state/commonFields';
import { scopes } from '../lib/state/scopes';
import { selectBlock } from '../lib/state/olxjson';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';

interface EventLog {
  description?: string;
  events: Array<{
    event: string;
    [key: string]: any;
  }>;
}

function loadEventLog(filePath: string): EventLog {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return JSON.parse(content);
}

function replayEvents(events: EventLog['events'], verbose: boolean = false) {
  // Initialize the store
  const reduxStore = store.init();

  console.log(`Replaying ${events.length} events...`);

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (verbose) {
      console.log(`[${i + 1}/${events.length}] ${event.event}`,
        event.id ? `id=${event.id}` : '',
        event.source ? `source=${event.source}` : ''
      );
    }

    // Dispatch through lo_event's redux logger format
    reduxStore.dispatch({
      redux_type: 'EMIT_EVENT',
      type: event.event,
      payload: JSON.stringify(event)
    });
  }

  return reduxStore;
}

function printState(reduxStore: any) {
  const state = reduxStore.getState();
  const appState = state.application_state;

  console.log('\n=== Final State ===\n');

  // Print olxjson content summary
  if (appState.olxjson) {
    console.log('OLX Content:');
    for (const [source, blocks] of Object.entries(appState.olxjson)) {
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
  if (appState.component && Object.keys(appState.component).length > 0) {
    console.log('Component State:');
    for (const [id, fields] of Object.entries(appState.component)) {
      console.log(`  ${id}:`, JSON.stringify(fields));
    }
    console.log();
  }

  // Print system state
  if (appState.system && Object.keys(appState.system).length > 0) {
    console.log('System State:', JSON.stringify(appState.system));
    console.log();
  }
}

function queryValues(reduxStore: any, queries: string[]) {
  const state = reduxStore.getState();

  console.log('=== Queries ===\n');

  for (const query of queries) {
    // Simple query format: field:id (e.g., "value:input1" or "correct:grader1")
    const [fieldName, id] = query.split(':');

    const field = (commonFields as any)[fieldName];
    if (!field) {
      console.log(`  ${query}: unknown field "${fieldName}"`);
      continue;
    }

    const props = { id };
    const value = fieldSelector(state, props, field, { id, fallback: undefined });
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

  const reduxStore = replayEvents(eventLog.events, verbose);
  printState(reduxStore);

  // Query common grading values
  queryValues(reduxStore, [
    'value:NumericalGraderBasic.input',
    'correct:NumericalGraderBasic.grader',
    'submitCount:NumericalGraderBasic.grader'
  ]);

  // Exit explicitly - lo_event's async queue keeps Node alive otherwise
  process.exit(0);

} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
