// apps/static/src/replay/parseLog.test.ts
//
// Tests the browser-safe log parser against a SYNTHETIC connection log
// (ndjson_header + a handful of events) built in-memory. No student data or
// fixtures required.
//
// Also validates end-to-end reconstruction: a log with a fetch_blob_response
// must replay into non-trivial state.
//
import { describe, it, expect } from 'vitest';

import { parseNDJSON } from './parseLog';
import { replayToEvent } from '@/lib/replay';
import { initReducers } from '@/lib/state/store';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';

// Register field reducers so replay uses real reducers (mirrors store.init).
initReducers(BLOCK_REGISTRY);

const T0 = Date.parse('2026-07-01T13:00:00.000Z');

function isoAt(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

// Mirrors the production log shape: header line, server-sent state, client
// events, and save_blob (which has no id).
const SAMPLE = [
  {
    event: 'ndjson_header',
    started: isoAt(0),
    user: { user_id: 'testuser', provenance: 'nginx', safe_user_id: 'nginx-testuser', authorized: true },
  },
  {
    event: 'fetch_blob_response',
    data: { application_state: { component: { 'CONTENT/q1': { value: 'saved answer' } }, componentSetting: {}, system: {} } },
    metadata: { iso_ts: isoAt(1000) },
  },
  { event: 'UPDATE_VALUE', id: 'CONTENT/q1', value: 'edited answer', metadata: { iso_ts: isoAt(2000) } },
  { event: 'save_blob', blob: {}, metadata: { iso_ts: isoAt(3000) } },
].map((e) => JSON.stringify(e)).join('\n');

describe('parseNDJSON on a synthetic connection log', () => {
  it('parses the ndjson_header (user + started)', () => {
    const log = parseNDJSON(SAMPLE, 'sample.jsonl.gz');
    expect(log.header).toBeTruthy();
    expect(log.header?.user?.user_id).toBe('testuser');
    expect(log.header?.user?.safe_user_id).toBe('nginx-testuser');
    expect(log.header?.started).toBeTruthy();
  });

  it('separates events, strips save_blob from replayEvents, detects fetch_blob_response', () => {
    const log = parseNDJSON(SAMPLE, 'sample.jsonl.gz');
    expect(log.events.length).toBeGreaterThan(0);
    expect(log.hasFetchBlobResponse).toBe(true);
    // save_blob present in raw events but not in replayEvents
    expect(log.events.some(e => e.event === 'save_blob')).toBe(true);
    expect(log.replayEvents.some(e => e.event === 'save_blob')).toBe(false);
  });

  it('replays to non-trivial state (no component["undefined"] junk)', () => {
    const log = parseNDJSON(SAMPLE, 'sample.jsonl.gz');
    const state = replayToEvent(log.replayEvents);
    // fetch_blob_response + user events should produce real component state.
    expect(Object.keys(state.component).length).toBeGreaterThan(0);
    // save_blob filtering means no junk "undefined" key leaked in.
    expect(state.component['undefined']).toBeUndefined();
  });
});
