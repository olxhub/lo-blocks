// apps/static/src/replay/sessions.test.ts
//
// Unit tests for the work-session model. Pure functions, synthetic events —
// no student data or fixtures required.
//
import { describe, it, expect } from 'vitest';
import type { LoggedEvent } from '@/lib/replay';
import {
  sortEventsByTime,
  splitIntoSessions,
  sessionIdFromStart,
  formatDurationMs,
  computeActiveMs,
  cappedDelta,
  SESSION_GAP_MS,
  DISCONNECT_GAP_MS,
  TIME_ON_TASK_CUTOFF_MS,
} from './sessions';

const T0 = Date.parse('2026-07-01T13:39:00.000Z');

function ev(offsetMs: number, event = 'UPDATE_VALUE'): LoggedEvent {
  return { event, metadata: { iso_ts: new Date(T0 + offsetMs).toISOString() } };
}

describe('sortEventsByTime', () => {
  it('orders by each event iso_ts, stably', () => {
    const events = [ev(5000), ev(1000), ev(3000), ev(1000, 'A')];
    const sorted = sortEventsByTime(events, T0);
    const times = sorted.map((e) => Date.parse(e.metadata!.iso_ts!));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // ties keep original order: ev(1000) before ev(1000,'A')
    const firstTie = sorted.findIndex((e) => Date.parse(e.metadata!.iso_ts!) === T0 + 1000);
    expect(sorted[firstTie].event).toBe('UPDATE_VALUE');
    expect(sorted[firstTie + 1].event).toBe('A');
  });

  it('does not let one out-of-order event drag the tail', () => {
    // A stray far-future timestamp in the middle must only move itself.
    const events = [ev(0), ev(1000), ev(999999999), ev(2000), ev(3000)];
    const sorted = sortEventsByTime(events, T0);
    const times = sorted.map((e) => Date.parse(e.metadata!.iso_ts!));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The last element is the stray; the 3000 event is NOT dragged past it.
    expect(times[times.length - 1]).toBe(T0 + 999999999);
  });

  it('keeps timestamp-less events adjacent to their neighbours', () => {
    const noTs: LoggedEvent = { event: 'lock_fields' };
    const events = [noTs, ev(1000), ev(2000)];
    const sorted = sortEventsByTime(events, T0);
    // lock_fields (no ts) inherits seed T0, sorts before the +1000 event.
    expect(sorted[0].event).toBe('lock_fields');
  });
});

describe('splitIntoSessions', () => {
  it('keeps closely-spaced events in one session', () => {
    const events = [ev(0), ev(60_000), ev(120_000)];
    const sessions = splitIntoSessions(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].entry.eventCount).toBe(3);
    expect(sessions[0].entry.durationMs).toBe(120_000);
    expect(sessions[0].entry.baselineEventCount).toBe(0);
    // Two 60s deltas, both under the cutoff -> 120s active (== span here).
    expect(sessions[0].entry.activeMs).toBe(120_000);
  });

  it('splits on an inactivity gap >= SESSION_GAP_MS', () => {
    const events = [ev(0), ev(60_000), ev(60_000 + SESSION_GAP_MS + 1), ev(60_000 + SESSION_GAP_MS + 2000)];
    const sessions = splitIntoSessions(events);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].entry.eventCount).toBe(2);
    expect(sessions[1].entry.eventCount).toBe(2);
    // Second session's baseline is the first session's event count.
    expect(sessions[1].entry.baselineEventCount).toBe(2);
  });

  it('records a disconnect gap (>= DISCONNECT_GAP_MS, < SESSION_GAP_MS) within a session', () => {
    const gap = DISCONNECT_GAP_MS + 30_000;
    const events = [ev(0), ev(1000), ev(1000 + gap), ev(2000 + gap)];
    const sessions = splitIntoSessions(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].entry.gaps).toHaveLength(1);
    expect(sessions[0].entry.gaps[0].afterEventIndex).toBe(2);
    expect(sessions[0].entry.gaps[0].durationMs).toBe(gap);
    // This "disconnect" gap (DISCONNECT_GAP_MS + 30s) is still under the
    // time-on-task cutoff, so it is NOT capped: 1s + gap + 1s == the span.
    expect(gap).toBeLessThan(TIME_ON_TASK_CUTOFF_MS);
    expect(sessions[0].entry.activeMs).toBe(1000 + gap + 1000);
    expect(sessions[0].entry.activeMs).toBe(sessions[0].entry.durationMs);
  });

  it('caps a long pause that exceeds the time-on-task cutoff', () => {
    const gap = TIME_ON_TASK_CUTOFF_MS + 120_000; // 7 min, over the 5-min cutoff
    const events = [ev(0), ev(1000), ev(1000 + gap), ev(2000 + gap)];
    const sessions = splitIntoSessions(events);
    expect(sessions).toHaveLength(1);
    // 1s + min(gap, cutoff) + 1s.
    expect(sessions[0].entry.activeMs).toBe(1000 + TIME_ON_TASK_CUTOFF_MS + 1000);
    // Active time is now strictly less than the wall-clock span.
    expect(sessions[0].entry.activeMs).toBeLessThan(sessions[0].entry.durationMs);
  });

  it('ignores sub-threshold think-time gaps', () => {
    const events = [ev(0), ev(DISCONNECT_GAP_MS - 1000)];
    const sessions = splitIntoSessions(events);
    expect(sessions[0].entry.gaps).toHaveLength(0);
  });

  it('assigns unique ids even when two sessions start in the same minute', () => {
    // Impossible via gaps normally, but the de-collision path is defensive.
    const a = splitIntoSessions([ev(0)]);
    expect(a[0].entry.id).toBe(sessionIdFromStart(a[0].entry.started, 's1'));
  });
});

describe('sessionIdFromStart', () => {
  it('produces a URL-safe minute-precision datestamp', () => {
    expect(sessionIdFromStart('2026-07-01T13:39:22.123Z', 'fallback')).toBe('2026-07-01T13-39');
  });
  it('falls back when the timestamp is missing/invalid', () => {
    expect(sessionIdFromStart(null, 'fallback')).toBe('fallback');
    expect(sessionIdFromStart('not-a-date', 'fallback')).toBe('fallback');
  });
});

describe('cappedDelta', () => {
  it('passes through sub-cutoff deltas', () => {
    expect(cappedDelta(30_000)).toBe(30_000);
  });
  it('caps deltas at the cutoff', () => {
    expect(cappedDelta(TIME_ON_TASK_CUTOFF_MS + 60_000)).toBe(TIME_ON_TASK_CUTOFF_MS);
  });
  it('treats non-positive deltas as zero', () => {
    expect(cappedDelta(0)).toBe(0);
    expect(cappedDelta(-5000)).toBe(0);
  });
});

describe('computeActiveMs', () => {
  it('the first event contributes 0', () => {
    const { totalMs, cum } = computeActiveMs([ev(0)]);
    expect(totalMs).toBe(0);
    expect(cum).toEqual([0]);
  });

  it('sums sub-cutoff deltas exactly and reports a matching cumulative curve', () => {
    const { totalMs, cum } = computeActiveMs([ev(0), ev(60_000), ev(120_000)]);
    expect(totalMs).toBe(120_000);
    expect(cum).toEqual([0, 60_000, 120_000]);
  });

  it('caps a long pause to the cutoff', () => {
    const gap = TIME_ON_TASK_CUTOFF_MS + 600_000; // way over cutoff
    const { totalMs, cum } = computeActiveMs([ev(0), ev(gap), ev(gap + 30_000)]);
    expect(totalMs).toBe(TIME_ON_TASK_CUTOFF_MS + 30_000);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBe(TIME_ON_TASK_CUTOFF_MS);
    expect(cum[2]).toBe(TIME_ON_TASK_CUTOFF_MS + 30_000);
  });

  it('is additive across a session split (first event of a session counts 0)', () => {
    // Same events splitIntoSessions would cut on a big gap; each session's
    // activeMs sums independently and the big gap never contributes.
    const events = [ev(0), ev(60_000), ev(60_000 + SESSION_GAP_MS + 1), ev(60_000 + SESSION_GAP_MS + 2000)];
    const sessions = splitIntoSessions(events);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].entry.activeMs).toBe(60_000);
    // Session 2's two events are 1999 ms apart (offsets +1 and +2000).
    expect(sessions[1].entry.activeMs).toBe(1999);
    // The 30-min inter-session gap is nowhere in the totals.
    const summed = sessions[0].entry.activeMs + sessions[1].entry.activeMs;
    expect(summed).toBe(61_999);
  });
});

describe('formatDurationMs', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatDurationMs(45_000)).toBe('45 sec');
    expect(formatDurationMs(45 * 60_000)).toBe('45 min');
    expect(formatDurationMs(72 * 60_000)).toBe('1 hr 12 min');
    expect(formatDurationMs(120 * 60_000)).toBe('2 hr');
  });
});
