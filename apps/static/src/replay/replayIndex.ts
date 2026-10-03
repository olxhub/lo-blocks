// apps/static/src/replay/replayIndex.ts
//
// Browser-side loaders for the replay-data payload emitted by
// scripts/build-replay-index.ts. Kept separate from that script so the browser
// bundle never pulls in Node-only code (fs/zlib).
//
// Layout fetched here (all under <basePath>/replay-data/):
//   runs.json                       -- run summaries for the landing page
//   runs/<run>/index.json           -- students -> sessions for one run
//   runs/<run>/content.json         -- course content ({ idMap, ok })
//   runs/<run>/logs/<user>.jsonl.gz -- merged per-student event stream
//
import type { LoggedEvent } from '@/lib/replay';
import { gunzipToText, parseNDJSON } from './parseLog';
import type { RunIndex, RunSummary, StudentEntry, SessionEntry } from './sessions';

export type { RunIndex, RunSummary, StudentEntry, SessionEntry };

export interface RunsManifest {
  generatedAt: string;
  runs: RunSummary[];
}

function replayDataUrl(basePath: string, rest: string): string {
  return `${basePath}/replay-data/${rest}`;
}

/** Fetch the run summaries. Returns null if no replay data was built. */
export async function fetchRuns(basePath: string): Promise<RunsManifest | null> {
  const res = await fetch(replayDataUrl(basePath, 'runs.json'));
  if (!res.ok) return null;
  return (await res.json()) as RunsManifest;
}

/** Fetch one run's student/session index. */
export async function fetchRunIndex(basePath: string, runId: string): Promise<RunIndex> {
  const res = await fetch(replayDataUrl(basePath, `runs/${runId}/index.json`));
  if (!res.ok) throw new Error(`HTTP ${res.status} loading run "${runId}"`);
  return (await res.json()) as RunIndex;
}

/** Fetch one run's course content ({ idMap, ok }) for the synthetic LOAD_OLXJSON. */
export async function fetchRunContent(basePath: string, runId: string): Promise<{ idMap: Record<string, any> }> {
  const res = await fetch(replayDataUrl(basePath, `runs/${runId}/content.json`));
  if (!res.ok) throw new Error(`HTTP ${res.status} loading content for run "${runId}"`);
  return (await res.json()) as { idMap: Record<string, any> };
}

/** Defensive: mirror the builder's filename sanitisation. */
function fileNameForUser(safeUserId: string): string {
  return safeUserId.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Fetch a student's full merged event stream (all sessions concatenated, in
 * timestamp order). Sessions are slices into this array — see sliceSession.
 */
export async function fetchStudentEvents(
  basePath: string,
  runId: string,
  student: StudentEntry,
): Promise<LoggedEvent[]> {
  const url = replayDataUrl(basePath, `runs/${runId}/logs/${fileNameForUser(student.safeUserId)}.jsonl.gz`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading events for ${student.userId}`);
  const buf = await res.arrayBuffer();
  const text = await gunzipToText(buf);
  return parseNDJSON(text, `${student.safeUserId}.jsonl`).replayEvents;
}

/**
 * Given a student's full merged stream and a target session, return:
 *   - baseline: events from earlier sessions (frozen, pre-applied)
 *   - sessionEvents: just this session's events (what the scrubber covers)
 */
export function sliceSession(
  allEvents: LoggedEvent[],
  session: SessionEntry,
): { baseline: LoggedEvent[]; sessionEvents: LoggedEvent[] } {
  const start = session.baselineEventCount;
  const end = start + session.eventCount;
  return {
    baseline: allEvents.slice(0, start),
    sessionEvents: allEvents.slice(start, end),
  };
}

export function findStudent(index: RunIndex, safeUserId: string): StudentEntry | undefined {
  return index.students.find((s) => s.safeUserId === safeUserId);
}

export function findSession(student: StudentEntry, sessionId: string): SessionEntry | undefined {
  return student.sessions.find((s) => s.id === sessionId);
}
