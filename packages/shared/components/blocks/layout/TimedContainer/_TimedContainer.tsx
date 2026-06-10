// _TimedContainer - container with time limit that disables interaction
// when time expires.
//
// Timer logic uses wall-clock time (Date.now() - startTime) for accuracy.
// All state lives in Redux for replay: started, expired, startTime, remaining.
//
// Display: a "rough clock" that gets more precise as time runs low.
// Granularity is defined by TIME_BANDS — a declarative table mapping
// time ranges to step sizes. No configuration needed; it just works
// from the duration.
//
// Before/after: simple text attributes for the start and expired screens.
// For richer customization, use when= expressions on children:
//
//   when="!@timer.started"                    → before content
//   when="@timer.started && !@timer.expired"  → during only
//   when="@timer.expired"                     → after content

'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useRef, useCallback } from 'react';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { z_olx_duration } from '@/lib/blocks/attributeSchemas';
import RenderMarkdown from '@/components/common/RenderMarkdown';

// ─── Rough clock ────────────────────────────────────────────────────────────
//
// TIME_BANDS defines display granularity at each time range.
// Each entry: [below, step] — "when remaining time is below `below`,
// display updates in `step` increments."
//
// The display shows the last threshold crossed from above:
//   17 minutes remaining with 5-minute steps → shows "20 minutes"
//   15 minutes remaining → updates to "15 minutes"

const MINUTE = 60;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;

const TIME_BANDS = [
  //  below          step                example displays
  //  ─────          ────                ────────────────
  '15 seconds    :   1 second',       // 15... 14... 13... 2... 1...
  '30 seconds    :   5 seconds',      // "25 seconds", "20 seconds", "15 seconds"
  ' 2 minutes    :  15 seconds',      // "1:45", "1:30", ... "0:30"
  '10 minutes    :   1 minute',       // "9 minutes", "8 minutes", ... "2 minutes"
  '30 minutes    :   5 minutes',      // "25 minutes", "20 minutes", ... "10 minutes"
  ' 2 hours      :  15 minutes',      // "1:45", "1:30", ... "30 minutes"
  ' 2 days       :   1 hour',         // "5 hours", "4 hours", ... "2 hours"
  '              :   1 day',          // "3 days", "2 days"
].map(line => {
  const [below, step] = line.split(':').map(s => s.trim());
  return {
    below: below ? z_olx_duration.parse(below) : Infinity,
    step: z_olx_duration.parse(step),
  };
});

function getRoughTime(seconds) {
  if (seconds <= 0) return 0;
  for (const { below, step } of TIME_BANDS) {
    if (seconds < below) {
      return Math.ceil(seconds / step) * step;
    }
  }
  return Math.ceil(seconds / DAY) * DAY;
}

function formatThreshold(seconds) {
  if (seconds <= 0) return "Time's up!";
  if (seconds < 15) return `${seconds}...`;

  if (seconds >= DAY) {
    const days = Math.round(seconds / DAY);
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (seconds >= HOUR) {
    const hours = Math.floor(seconds / HOUR);
    const mins = Math.round((seconds % HOUR) / MINUTE);
    if (mins === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
    return `${hours}:${String(mins).padStart(2, '0')}`;
  }
  if (seconds >= MINUTE) {
    const mins = Math.round(seconds / MINUTE);
    return mins === 1 ? '1 minute' : `${mins} minutes`;
  }
  return `${seconds} seconds`;
}

/** Exact duration for the pre-start display (no rounding). */
function formatDuration(seconds) {
  if (seconds >= DAY) {
    const days = Math.floor(seconds / DAY);
    const rem = seconds % DAY;
    const parts = [days === 1 ? '1 day' : `${days} days`];
    if (rem >= HOUR) {
      const hours = Math.round(rem / HOUR);
      parts.push(hours === 1 ? '1 hour' : `${hours} hours`);
    }
    return parts.join(' ');
  }
  if (seconds >= HOUR) {
    const hours = Math.floor(seconds / HOUR);
    const rem = seconds % HOUR;
    const parts = [hours === 1 ? '1 hour' : `${hours} hours`];
    if (rem >= MINUTE) {
      const mins = Math.round(rem / MINUTE);
      parts.push(mins === 1 ? '1 minute' : `${mins} minutes`);
    }
    return parts.join(' ');
  }
  if (seconds >= MINUTE) {
    const mins = Math.floor(seconds / MINUTE);
    const rem = seconds % MINUTE;
    const parts = [mins === 1 ? '1 minute' : `${mins} minutes`];
    if (rem > 0) parts.push(rem === 1 ? '1 second' : `${rem} seconds`);
    return parts.join(' ');
  }
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

// Color shifts from neutral to red as time runs out.
// Squared curve: stays calm early, intensifies near the end.
function urgencyColor(fraction) {
  const urgency = (1 - Math.max(0, Math.min(1, fraction))) ** 2;
  const r = Math.round(200 * urgency);
  return `rgb(${r}, 0, 0)`;
}

// ─── Component ──────────────────────────────────────────────────────────────

function _TimedContainer(props: RuntimeProps) {
  const {
    fields, duration,
    start = 'go', label = 'Start',
    before, after, hideuntilstart,
  } = props;

  const [started, setStarted] = useFieldState(props, fields.started, false);
  const [expired, setExpired] = useFieldState(props, fields.expired, false);
  const [startTime, setStartTime] = useFieldState(props, fields.startTime, null);
  const [remaining, setRemaining] = useFieldState(props, fields.remaining, duration);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // useKids must be called unconditionally (when= filtering happens here)
  const { kids: renderedKids } = useKids(props);

  // Auto-start on mount if start="render"
  useEffect(() => {
    if (start !== 'render' || started || props.runtime.sideEffectFree) return;
    const now = Date.now();
    setStarted(true);
    setStartTime(now);
    setRemaining(duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer interval: ticks every second, updates remaining in Redux
  useEffect(() => {
    if (!started || expired || !startTime || props.runtime.sideEffectFree) return;

    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(Math.floor(left));

      if (left <= 0) {
        setExpired(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [started, expired, startTime, duration, setExpired, setRemaining, props.runtime.sideEffectFree]);

  // When container becomes inert, force-blur any focused element inside it.
  // Browsers *should* do this for the inert attribute, but not all do reliably.
  const inactive = !started || expired;
  useEffect(() => {
    if (inactive && containerRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [inactive]);

  // Start button handler
  const handleStart = useCallback(() => {
    if (started) return;
    const now = Date.now();
    setStarted(true);
    setStartTime(now);
    setRemaining(duration);
  }, [started, setStarted, setStartTime, setRemaining, duration]);

  // ── Render ──

  const roughTime = getRoughTime(remaining);
  const fraction = duration > 0 ? remaining / duration : 0;

  const borderClass = started && !expired
    ? 'border-accent'
    : 'border-border';

  return (
    <div className={`border rounded-lg overflow-hidden ${borderClass}`}>
      {/* Pre-start: before text + duration + start button */}
      {!started && start === 'go' && (
        <div className="text-center py-8 px-4">
          {before && (
            <div className="text-secondary mb-4 max-w-prose mx-auto">
              <RenderMarkdown ns={props.runtime.ns}>{before}</RenderMarkdown>
            </div>
          )}
          <div className="text-3xl font-light text-dimmed mb-6">
            {formatDuration(duration)}
          </div>
          <button
            className="px-8 py-3 bg-accent text-inverse rounded-lg hover:bg-accent-hover font-medium text-lg transition-colors"
            onClick={handleStart}
          >
            {label}
          </button>
        </div>
      )}

      {/* Active: rough clock */}
      {started && !expired && (
        <div
          className="text-center py-2 font-semibold text-lg"
          style={{ color: urgencyColor(fraction) }}
          aria-live="polite"
        >
          {formatThreshold(roughTime)}
        </div>
      )}

      {/* Expired: banner (flashes red, settles to gray via CSS animation) */}
      {expired && (
        <div className="text-center py-3">
          <style>{`@keyframes timed-settle { from { color: #b91c1c } to { color: #6b7280 }}`}</style>
          <div className="font-semibold" style={{ animation: 'timed-settle 4s ease-out forwards' }}>
            Time's up!
          </div>
          {after && (
            <div className="text-dimmed text-sm mt-1">
              <RenderMarkdown ns={props.runtime.ns}>{after}</RenderMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Content — inert when not active, dimmed when expired */}
      {!(hideuntilstart && !started) && (
        <div
          ref={containerRef}
          inert={inactive || undefined}
          className={`p-4 ${expired ? 'opacity-60 bg-surface' : ''}`}
        >
          {renderedKids}
        </div>
      )}
    </div>
  );
}

export default _TimedContainer;
