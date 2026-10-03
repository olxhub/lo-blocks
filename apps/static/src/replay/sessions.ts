// apps/static/src/replay/sessions.ts
//
// The "work session" model shared by the build-time index builder and the
// browser viewer.
//
// Background: the raw data is one NDJSON log per *browser connection*. A single
// student sitting down to work produces many connection logs — every reload,
// tab-sleep/wake, or network blip starts a new one. The old viewer surfaced
// that connection taxonomy (self-contained / reconnect / partial) directly,
// which is meaningless to a teacher.
//
// This module reframes the data the way a teacher thinks about it:
//
//   student -> work sessions -> events
//
// A *work session* is a run of activity with no inactivity gap longer than
// SESSION_GAP_MS. We merge all of a student's connection logs into one
// timestamp-ordered event stream (NO dedupe — cross-connection resends are
// negligible, ~0.04%, and content-identical frames like repeated
// UPDATE_DRAG_OVER_INDEX are real interaction), then cut that stream into
// sessions at the big gaps. Smaller gaps (connection boundaries, brief
// tab-sleeps) become subtle "long pause" markers *within* a session.
//
// Two different notions of time matter to a teacher:
//   - the session's wall-clock SPAN (last ts - first ts), and
//   - the student's TIME-ON-TASK ("active time"): the same span with long
//     idle stretches capped, so a 16-minute tab-sleep doesn't inflate the
//     number. See computeActiveMs / TIME_ON_TASK_CUTOFF_MS.
//
// This file is deliberately free of Node APIs so the viewer bundle can import
// it directly.
//
import type { LoggedEvent } from '@/lib/replay';

// -----------------------------------------------------------------------------
// Tunables
// -----------------------------------------------------------------------------

/** Inactivity longer than this starts a new work session. */
export const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

/**
 * A gap at least this long, but shorter than SESSION_GAP_MS, is drawn as a
 * "long pause" marker on the scrubber and (when scrubbed into) shown as a calm
 * overlay. Below this, gaps are just normal think-time.
 *
 * (Historically named DISCONNECT_GAP_MS; the concept is a long pause — the tab
 * was backgrounded or the laptop slept — not an error. Teacher-facing copy
 * says "long pause" everywhere.)
 */
export const DISCONNECT_GAP_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Time-on-task cutoff. When summing the deltas between consecutive events, we
 * cap each delta at this value: activeMs += min(ts - lastTs, cutoff). Long
 * idle stretches (tab asleep, stepped away) therefore contribute at most the
 * cutoff, so "active time" approximates real time-on-task rather than
 * wall-clock span.
 *
 * 5 minutes is chosen for this open-ended task (per the teacher: the exact
 * cutoff — 30s, 5min — doesn't change the big picture much).
 */
export const TIME_ON_TASK_CUTOFF_MS = 5 * 60 * 1000; // 5 minutes

// -----------------------------------------------------------------------------
// Types (shared with the emitted index.json)
// -----------------------------------------------------------------------------

/** A long pause inside a work session (tab backgrounded / laptop asleep). */
export interface GapMarker {
  /** Index, within the session's event list, of the event *after* the gap. */
  afterEventIndex: number;
  /** Gap length in milliseconds. */
  durationMs: number;
}

export interface SessionEntry {
  /** Stable id: a compact local datestamp, e.g. "2026-07-01T13-39". Used in URLs. */
  id: string;
  /** ISO start time (first event's timestamp). */
  started: string | null;
  /** ISO end time (last event's timestamp). */
  ended: string | null;
  /** Wall-clock span, ms (ended - started). */
  durationMs: number;
  /**
   * Time-on-task, ms: sum of capped deltas between consecutive events
   * (see computeActiveMs / TIME_ON_TASK_CUTOFF_MS). The first event of the
   * session contributes 0 (no preceding event inside the session), so a
   * single-event session has activeMs === 0.
   */
  activeMs: number;
  /** Number of replayable events in this session. */
  eventCount: number;
  /**
   * Number of replayable events in earlier sessions of the same student. The
   * viewer pre-applies these as the frozen baseline (replayToEvent upTo) so a
   * session opens with the student's prior work already in place.
   */
  baselineEventCount: number;
  /** Long-pause gaps within this session. */
  gaps: GapMarker[];
}

export interface StudentEntry {
  /** safe_user_id — stable id used for grouping and URLs. */
  safeUserId: string;
  /** Human user_id when available (falls back to safeUserId). */
  userId: string;
  sessions: SessionEntry[];
  /** Total replayable events across all sessions. */
  totalEventCount: number;
  /** Sum of session wall-clock spans, ms. */
  totalDurationMs: number;
  /** Sum of session time-on-task, ms (the teacher-facing "active time"). */
  totalActiveMs: number;
  /** ISO timestamp of the student's most recent event. */
  lastActive: string | null;
}

/** One run's student/session manifest (emitted as runs/<id>/index.json). */
export interface RunIndex {
  id: string;
  label: string;
  generatedAt: string;
  students: StudentEntry[];
}

/** A run summary shown on the landing page (emitted in runs.json). */
export interface RunSummary {
  id: string;
  label: string;
  studentCount: number;
  sessionCount: number;
  /** Total time-on-task across all students in the run, ms. */
  totalActiveMs: number;
  /**
   * True when this run has downloadable response-data CSVs
   * (runs/<id>/responses.csv and sessions.csv). Drives the landing page's
   * "Response Data" section. Optional so older runs.json payloads still parse.
   */
  hasResponses?: boolean;
}

// -----------------------------------------------------------------------------
// Timestamp helpers
// -----------------------------------------------------------------------------

/** Milliseconds for an event's iso_ts, or null if absent/unparseable. */
export function eventTimeMs(e: LoggedEvent): number | null {
  const ts = e.metadata?.iso_ts;
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Sort a merged event stream chronologically by each event's own iso_ts.
 *
 * The sort is stable, so events sharing a timestamp (or all missing one) keep
 * their original relative order — which preserves per-connection sequencing.
 * Events that lack a usable timestamp inherit the previous event's time as
 * their key AFTER an initial pass, so they stay adjacent to their neighbours
 * rather than sinking to the front. `seedMs` (the earliest header start) seeds
 * that carry-forward for any leading timestamp-less events.
 *
 * We key on each event's *actual* time (not a running max), so a single stray
 * event with an out-of-order timestamp only moves itself, instead of dragging
 * the whole tail with it.
 */
export function sortEventsByTime(events: LoggedEvent[], seedMs: number | null): LoggedEvent[] {
  let carry = seedMs ?? 0;
  const keyed = events.map((e, i) => {
    const t = eventTimeMs(e);
    if (t != null) carry = t;
    return { e, i, k: t ?? carry };
  });
  keyed.sort((a, b) => (a.k - b.k) || (a.i - b.i));
  return keyed.map((x) => x.e);
}

// -----------------------------------------------------------------------------
// Time-on-task
// -----------------------------------------------------------------------------

/**
 * The contribution of one inter-event gap to time-on-task: the raw delta,
 * capped at TIME_ON_TASK_CUTOFF_MS. Negative/zero deltas contribute 0.
 */
export function cappedDelta(deltaMs: number): number {
  if (!(deltaMs > 0)) return 0;
  return Math.min(deltaMs, TIME_ON_TASK_CUTOFF_MS);
}

/**
 * Time-on-task for a timestamp-ordered event list: the sum of capped deltas
 * between consecutive events. The FIRST event contributes 0 (nothing precedes
 * it within the list), so a single-event session has activeMs === 0 — this is
 * also what makes activeMs additive across session boundaries: the first event
 * of a new session does not count the (large) gap since the previous session.
 *
 * Also returns per-index cumulative active time (cum[i] = active time from the
 * first event up to and including event i), which the scrubber uses as its
 * time axis. cum has the same length as `events`; cum[0] === 0.
 */
export function computeActiveMs(events: LoggedEvent[]): { totalMs: number; cum: number[] } {
  const cum: number[] = new Array(events.length).fill(0);
  let total = 0;
  let prevMs: number | null = null;
  for (let i = 0; i < events.length; i++) {
    const t = eventTimeMs(events[i]);
    if (prevMs != null && t != null) total += cappedDelta(t - prevMs);
    cum[i] = total;
    if (t != null) prevMs = t;
  }
  return { totalMs: total, cum };
}

// -----------------------------------------------------------------------------
// Session-id datestamp
// -----------------------------------------------------------------------------

/**
 * Build a URL-safe session id from an ISO start time: a local-ish compact
 * datestamp like "2026-07-01T13-39". We use the UTC-derived ISO string (stable
 * across machines) trimmed to minute precision with ':' replaced so it is safe
 * in a URL hash. Deterministic and human-legible.
 */
export function sessionIdFromStart(startedIso: string | null, fallback: string): string {
  if (!startedIso) return fallback;
  const d = new Date(startedIso);
  if (!Number.isFinite(d.getTime())) return fallback;
  // YYYY-MM-DDTHH-MM  (UTC)
  const iso = d.toISOString(); // 2026-07-01T13:39:22.123Z
  return iso.slice(0, 16).replace(/:/g, '-');
}

// -----------------------------------------------------------------------------
// Splitting a merged stream into work sessions
// -----------------------------------------------------------------------------

export interface SplitSession {
  entry: SessionEntry;
  /** The events belonging to this session (already timestamp-ordered). */
  events: LoggedEvent[];
}

/**
 * Split a single student's merged, timestamp-ordered event stream into work
 * sessions. `events` must already be sorted (see sortEventsByTime).
 */
export function splitIntoSessions(events: LoggedEvent[]): SplitSession[] {
  const sessions: SplitSession[] = [];
  if (events.length === 0) return sessions;

  // Group indices into runs separated by SESSION_GAP_MS.
  let cur: LoggedEvent[] = [];
  let curGaps: GapMarker[] = [];
  let prevMs: number | null = null;
  let baseline = 0;

  const flush = () => {
    if (cur.length === 0) return;
    const startMs = firstTimeMs(cur);
    const endMs = lastTimeMs(cur);
    const startedIso = startMs != null ? new Date(startMs).toISOString() : null;
    const endedIso = endMs != null ? new Date(endMs).toISOString() : null;
    const fallbackId = `s${sessions.length + 1}`;
    sessions.push({
      entry: {
        id: sessionIdFromStart(startedIso, fallbackId),
        started: startedIso,
        ended: endedIso,
        durationMs: startMs != null && endMs != null ? Math.max(0, endMs - startMs) : 0,
        activeMs: computeActiveMs(cur).totalMs,
        eventCount: cur.length,
        baselineEventCount: baseline,
        gaps: curGaps,
      },
      events: cur,
    });
    baseline += cur.length;
    cur = [];
    curGaps = [];
  };

  for (const e of events) {
    const t = eventTimeMs(e);
    if (prevMs != null && t != null) {
      const gap = t - prevMs;
      if (gap >= SESSION_GAP_MS) {
        flush();
      } else if (gap >= DISCONNECT_GAP_MS) {
        curGaps.push({ afterEventIndex: cur.length, durationMs: gap });
      }
    }
    cur.push(e);
    if (t != null) prevMs = t;
  }
  flush();

  // De-collide any session ids that landed on the same minute.
  const seen = new Map<string, number>();
  for (const s of sessions) {
    const n = seen.get(s.entry.id) ?? 0;
    seen.set(s.entry.id, n + 1);
    if (n > 0) s.entry.id = `${s.entry.id}-${n + 1}`;
  }

  return sessions;
}

function firstTimeMs(events: LoggedEvent[]): number | null {
  for (const e of events) {
    const t = eventTimeMs(e);
    if (t != null) return t;
  }
  return null;
}

function lastTimeMs(events: LoggedEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = eventTimeMs(events[i]);
    if (t != null) return t;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Display helpers (browser)
// -----------------------------------------------------------------------------

/** "45 min", "1 hr 12 min", "38 sec". */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return '0 sec';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} sec`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hr} hr` : `${hr} hr ${min} min`;
}

/** "Jul 1, 1:39 PM". */
export function formatStart(startedIso: string | null): string {
  if (!startedIso) return 'unknown time';
  const d = new Date(startedIso);
  if (!Number.isFinite(d.getTime())) return 'unknown time';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Jul 1, 1:39 PM · 45 min (~22 min active) · 312 events". */
export function sessionLabel(s: SessionEntry): string {
  return `${formatStart(s.started)} · ${formatDurationMs(s.durationMs)} (~${formatDurationMs(s.activeMs)} active) · ${s.eventCount} events`;
}

/** Day bucket key for grouping, e.g. "Tuesday, Jul 1". */
export function dayLabel(startedIso: string | null): string {
  if (!startedIso) return 'Unknown day';
  const d = new Date(startedIso);
  if (!Number.isFinite(d.getTime())) return 'Unknown day';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}
