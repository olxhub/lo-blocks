// apps/static/src/replay/SessionScrubber.tsx
//
// The teacher-facing scrubber for a single work session. Purpose-built for the
// replay viewer (rather than reusing the shared debug ReplayModeIndicator,
// whose decorative "⏪" glyph and "Event N of M" framing confused teachers).
//
// It shows:
//   - a clean timeline the teacher can click / drag to scrub
//   - subtle "long pause" ticks where activity gaps occurred (tab backgrounded
//     or laptop asleep — not an error)
//   - prev/next frame arrows and a readable readout
//   - an Events / Time toggle for the timeline axis
//
// Two axes:
//   - Events: even spacing, one tick per interaction frame. Predictable to drag.
//   - Time: spacing by *active time* (time-on-task) — cumulative capped delta,
//     the same measure the index reports. We deliberately do NOT use raw
//     wall-clock, because a single 16-minute tab-sleep would eat 95% of the bar;
//     capping collapses each long pause to its cutoff so the bar reads as
//     time-on-task, while the pause ticks still mark where the pauses happened.
//
// Scrubbing always resolves to an event index (each event is one interaction
// frame); the axis only changes how index maps to horizontal position. Keyboard
// arrows step one event in either mode.
//
'use client';

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LoggedEvent } from '@/lib/replay';
import type { GapMarker } from './sessions';
import { eventTimeMs, formatDurationMs, computeActiveMs } from './sessions';

type Axis = 'events' | 'time';

interface Props {
  events: LoggedEvent[];
  index: number;
  onIndex: (i: number) => void;
  gaps: GapMarker[];
  axis: Axis;
  onAxis: (a: Axis) => void;
}

export default function SessionScrubber({ events, index, onIndex, gaps, axis, onAxis }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const count = events.length;
  const clamped = Math.max(0, Math.min(index, count - 1));

  const times = useMemo(() => events.map(eventTimeMs), [events]);
  const firstTs = useMemo(() => times.find((t) => t != null) ?? null, [times]);
  const lastTs = useMemo(() => {
    for (let i = times.length - 1; i >= 0; i--) if (times[i] != null) return times[i];
    return null;
  }, [times]);
  const curTs = times[clamped] ?? null;

  const elapsed = firstTs != null && curTs != null ? curTs - firstTs : null;
  const total = firstTs != null && lastTs != null ? lastTs - firstTs : null;

  // Cumulative active time (time-on-task) per event; used for the time axis and
  // the time-mode readout. cum[i] is active ms from the first event through i.
  const { totalMs: totalActive, cum } = useMemo(() => computeActiveMs(events), [events]);

  // Fraction 0..1 for a given event index, on the active-time axis.
  const timeFrac = useCallback((i: number) => {
    if (totalActive <= 0) return count <= 1 ? 0 : i / (count - 1);
    return cum[Math.max(0, Math.min(i, count - 1))] / totalActive;
  }, [cum, totalActive, count]);

  // Position (0..1) of the thumb for the current index, per axis.
  const posFrac = axis === 'time'
    ? timeFrac(clamped)
    : (count <= 1 ? 0 : clamped / (count - 1));
  const pct = posFrac * 100;

  // Map a fraction of the track back to an event index, per axis.
  const indexFromFrac = useCallback((p: number) => {
    if (count === 0) return 0;
    if (axis === 'events' || totalActive <= 0) return Math.round(p * (count - 1));
    // Time axis: find the event whose cumulative active time is closest to the
    // target. cum is non-decreasing, so a linear scan for the nearest is fine
    // (sessions are already sliced to one work session).
    const target = p * totalActive;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      const d = Math.abs(cum[i] - target);
      if (d < bestDist) { bestDist = d; best = i; }
      else if (cum[i] - target > bestDist) break; // past the target, only grows
    }
    return best;
  }, [axis, count, cum, totalActive]);

  const setFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el || count === 0) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onIndex(indexFromFrac(p));
  }, [count, onIndex, indexFromFrac]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setFromClientX(e.clientX);
    const move = (ev: MouseEvent) => setFromClientX(ev.clientX);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [setFromClientX]);

  // Keyboard: left/right step one frame (event) regardless of axis.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onIndex(Math.max(0, clamped - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onIndex(Math.min(count - 1, clamped + 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clamped, count, onIndex]);

  // Gap tick position: even spacing on the event axis, active-time spacing on
  // the time axis (the pause itself collapses to its cap, so the tick sits at
  // the active-time coordinate of the frame right after the pause).
  const gapPct = (g: GapMarker) => (
    axis === 'time'
      ? timeFrac(g.afterEventIndex) * 100
      : (count <= 1 ? 0 : (g.afterEventIndex / (count - 1)) * 100)
  );

  const PAUSE_TOOLTIP = 'A long pause — usually the tab was in the background or the laptop was asleep.';

  return (
    <div className="rv-scrubber">
      <div className="rv-scrubber-controls">
        <button
          className="rv-iconbtn"
          onClick={() => onIndex(Math.max(0, clamped - 1))}
          disabled={clamped <= 0}
          aria-label="Previous frame"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          className="rv-iconbtn"
          onClick={() => onIndex(Math.min(count - 1, clamped + 1))}
          disabled={clamped >= count - 1}
          aria-label="Next frame"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="rv-scrubber-readout">
          <span className="rv-frame">Frame {clamped + 1} of {count}</span>
          {axis === 'time' ? (
            <span className="rv-elapsed" title="Active time (time-on-task): idle stretches are capped, so this is smaller than wall-clock time.">
              {formatDurationMs(cum[clamped] ?? 0)}{' '}
              <span className="rv-elapsed-total">/ {formatDurationMs(totalActive)} active</span>
            </span>
          ) : (
            elapsed != null && total != null && (
              <span className="rv-elapsed">
                {formatDurationMs(elapsed)} <span className="rv-elapsed-total">/ {formatDurationMs(total)}</span>
              </span>
            )
          )}
        </div>
        <div className="rv-header-spacer" />
        <div className="rv-axis-toggle" role="group" aria-label="Timeline axis">
          <button
            type="button"
            className={`rv-axis-btn ${axis === 'events' ? 'rv-axis-btn-active' : ''}`}
            aria-pressed={axis === 'events'}
            onClick={() => onAxis('events')}
            title="Space the timeline evenly by interaction (one step per event)."
          >
            Events
          </button>
          <button
            type="button"
            className={`rv-axis-btn ${axis === 'time' ? 'rv-axis-btn-active' : ''}`}
            aria-pressed={axis === 'time'}
            onClick={() => onAxis('time')}
            title="Space the timeline by active time (time-on-task); long pauses collapse to a cap."
          >
            Time
          </button>
        </div>
      </div>

      <div className="rv-track" ref={trackRef} onMouseDown={onMouseDown} role="slider"
        aria-valuemin={1} aria-valuemax={count} aria-valuenow={clamped + 1} tabIndex={0}>
        <div className="rv-track-rail" />
        <div className="rv-track-fill" style={{ width: `${pct}%` }} />
        {gaps.map((g, i) => (
          <div
            key={i}
            className="rv-track-gap"
            style={{ left: `${gapPct(g)}%` }}
            title={`${PAUSE_TOOLTIP} (about ${formatDurationMs(g.durationMs)})`}
          />
        ))}
        <div className="rv-track-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
