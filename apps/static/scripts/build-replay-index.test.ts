// apps/static/scripts/build-replay-index.test.ts
//
// Tests the multi-run replay-index builder against SYNTHETIC connection logs
// generated at test time. No student data / fixtures required: we write a few
// tiny .jsonl.gz files into an OS temp dir, run buildRun, and assert on the
// student -> session structure it derives.
//
// The only user id used here is the neutral test account (nginx-testuser),
// per the repo's no-student-pseudonyms rule.
//
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';

import { buildRun } from './build-replay-index';
import { SESSION_GAP_MS } from '../src/replay/sessions';

const BASE = Date.parse('2026-07-01T13:00:00.000Z');

function isoAt(offsetMs: number): string {
  return new Date(BASE + offsetMs).toISOString();
}

/** Write a synthetic connection log (ndjson_header + events) as .jsonl.gz. */
function writeLog(
  dir: string,
  name: string,
  userId: string,
  startedOffsetMs: number,
  eventOffsetsMs: number[],
) {
  const lines: string[] = [];
  lines.push(JSON.stringify({
    event: 'ndjson_header',
    started: isoAt(startedOffsetMs),
    user: { user_id: userId, provenance: 'nginx', safe_user_id: `nginx-${userId}`, authorized: true },
  }));
  for (const off of eventOffsetsMs) {
    lines.push(JSON.stringify({ event: 'UPDATE_VALUE', id: 'x', metadata: { iso_ts: isoAt(off) } }));
  }
  fs.writeFileSync(path.join(dir, name), zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf-8')));
}

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-idx-test-'));

  // testuser: two connection logs a few minutes apart -> should merge into ONE
  // work session (gap < SESSION_GAP_MS).
  writeLog(dir, 'events-c1-nginx-testuser-1.jsonl.gz', 'testuser', 0, [0, 60_000, 120_000]);
  writeLog(dir, 'events-c2-nginx-testuser-2.jsonl.gz', 'testuser', 300_000, [300_000, 360_000]);

  // testuser: a later log well past SESSION_GAP_MS after the last event of the
  // merged first session (which ends at 360_000) -> a SECOND work session.
  const later = 360_000 + SESSION_GAP_MS + 60_000;
  writeLog(dir, 'events-c3-nginx-testuser-3.jsonl.gz', 'testuser', later, [later, later + 30_000]);
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('buildRun', () => {
  it('groups connection logs by student', () => {
    const { index } = buildRun('run1', 'Run One', dir);
    expect(index.id).toBe('run1');
    expect(index.students.map((s) => s.safeUserId)).toEqual(['nginx-testuser']);
    expect(index.students[0].userId).toBe('testuser');
  });

  it('merges connections within a gap into one session, splits on big gaps', () => {
    const { index } = buildRun('run1', 'Run One', dir);
    const stu = index.students[0];
    // Two work sessions: the merged early one, and the later one.
    expect(stu.sessions).toHaveLength(2);
    // First session merged 3 + 2 events across two connection logs.
    expect(stu.sessions[0].eventCount).toBe(5);
    expect(stu.sessions[1].eventCount).toBe(2);
    // Baselines chain: session 2 sees session 1's events as its frozen baseline.
    expect(stu.sessions[0].baselineEventCount).toBe(0);
    expect(stu.sessions[1].baselineEventCount).toBe(5);
  });

  it('computes per-student totals', () => {
    const { index } = buildRun('run1', 'Run One', dir);
    const stu = index.students[0];
    expect(stu.totalEventCount).toBe(7);
    expect(stu.lastActive).toBe(stu.sessions[1].ended);
    // Wall-clock totals sum session spans.
    expect(stu.totalDurationMs).toBe(stu.sessions[0].durationMs + stu.sessions[1].durationMs);
    // Active totals sum session time-on-task.
    expect(stu.totalActiveMs).toBe(stu.sessions[0].activeMs + stu.sessions[1].activeMs);
  });

  it('computes per-session active time (time-on-task), all deltas under cutoff here', () => {
    const { index } = buildRun('run1', 'Run One', dir);
    const stu = index.students[0];
    // Session 1 event offsets 0,60k,120k,300k,360k -> deltas 60k+60k+180k+60k.
    expect(stu.sessions[0].activeMs).toBe(360_000);
    // With no pause over the cutoff, active == wall-clock span.
    expect(stu.sessions[0].activeMs).toBe(stu.sessions[0].durationMs);
    // Session 2 two events 30k apart.
    expect(stu.sessions[1].activeMs).toBe(30_000);
  });

  it('reports run-level active time in the summary', () => {
    // buildRun returns only index; main() aggregates the summary, but we can
    // assert the invariant it uses: run active == sum of student active.
    const { index } = buildRun('run1', 'Run One', dir);
    const runActive = index.students.reduce((n, s) => n + s.totalActiveMs, 0);
    expect(runActive).toBe(390_000);
  });

  it('returns a merged, timestamp-ordered stream per student', () => {
    const { merged } = buildRun('run1', 'Run One', dir);
    expect(merged).toHaveLength(1);
    const times = merged[0].events.map((e) => Date.parse(e.metadata!.iso_ts!));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // Total events == sum of session event counts.
    expect(merged[0].events.length).toBe(7);
  });
});
