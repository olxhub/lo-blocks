// src/components/common/debug/ReplayModeIndicator.tsx
//
// Visual indicator and scrubber for replay mode.
// Displays a banner at the top of the page with:
// - Event position (e.g., "Event 5 of 23")
// - Timestamp since first event
// - Previous/Next buttons
// - Scrubber bar with time/event mode toggle
// - Return to Live button
//
'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useReplayContextOptional } from '@/lib/state/replayContext';
import type { LoggedEvent } from '@/lib/replay';
import './ReplayModeIndicator.css';

type ScrubberMode = 'event' | 'time';

/**
 * Format milliseconds as a human-readable duration.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Get timestamp from an event, or null if not available.
 */
function getEventTimestamp(event: LoggedEvent): number | null {
  const ts = event.metadata?.iso_ts;
  if (!ts) return null;
  return new Date(ts).getTime();
}

export default function ReplayModeIndicator() {
  const replayCtx = useReplayContextOptional();
  const [scrubberMode, setScrubberMode] = useState<ScrubberMode>('event');
  const scrubberRef = useRef<HTMLDivElement>(null);

  // Extract values with fallbacks for when context is inactive
  const isActive = replayCtx?.isActive ?? false;
  const selectedEventIndex = replayCtx?.selectedEventIndex ?? 0;
  const eventCount = replayCtx?.eventCount ?? 0;
  const getEvents = replayCtx?.getEvents ?? (() => []);
  const selectEvent = replayCtx?.selectEvent ?? (() => {});
  const clearReplay = replayCtx?.clearReplay ?? (() => {});
  const nextEvent = replayCtx?.nextEvent ?? (() => {});
  const prevEvent = replayCtx?.prevEvent ?? (() => {});

  const events = getEvents();

  // Compute timestamps for all events
  const timestamps = useMemo(() => {
    return events.map(e => getEventTimestamp(e));
  }, [events]);

  // Get first and current timestamps for offset display
  const firstTimestamp = timestamps[0];
  const currentTimestamp = timestamps[selectedEventIndex];
  const lastTimestamp = timestamps[timestamps.length - 1];

  // Time since first event
  const timeSinceFirst = (firstTimestamp != null && currentTimestamp != null)
    ? currentTimestamp - firstTimestamp
    : null;

  // Total duration
  const totalDuration = (firstTimestamp != null && lastTimestamp != null)
    ? lastTimestamp - firstTimestamp
    : null;

  // Scrubber position calculation
  const scrubberPosition = useMemo(() => {
    if (eventCount <= 1) return 0;

    if (scrubberMode === 'event') {
      // Event mode: linear by event index
      return (selectedEventIndex / (eventCount - 1)) * 100;
    } else {
      // Time mode: linear by timestamp
      if (totalDuration == null || totalDuration === 0 || timeSinceFirst == null) {
        return (selectedEventIndex / (eventCount - 1)) * 100;
      }
      return (timeSinceFirst / totalDuration) * 100;
    }
  }, [scrubberMode, selectedEventIndex, eventCount, totalDuration, timeSinceFirst]);

  // Handle scrubber click/drag
  const handleScrubberClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || eventCount === 0) return;

    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));

    if (scrubberMode === 'event') {
      // Event mode: map percent to event index
      const newIndex = Math.round(percent * (eventCount - 1));
      selectEvent(newIndex);
    } else {
      // Time mode: find event closest to this timestamp
      if (totalDuration == null || totalDuration === 0 || firstTimestamp == null) {
        const newIndex = Math.round(percent * (eventCount - 1));
        selectEvent(newIndex);
        return;
      }

      const targetTime = firstTimestamp + percent * totalDuration;

      // Find closest event
      let closestIndex = 0;
      let closestDiff = Infinity;
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        if (ts == null) continue;
        const diff = Math.abs(ts - targetTime);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIndex = i;
        }
      }
      selectEvent(closestIndex);
    }
  }, [scrubberMode, eventCount, firstTimestamp, totalDuration, timestamps, selectEvent]);

  // Keyboard navigation (only when replay is active)
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevEvent();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextEvent();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, prevEvent, nextEvent]);

  // Don't render if replay context isn't available or replay isn't active
  if (!isActive) {
    return null;
  }

  const isAtStart = selectedEventIndex <= 0;
  const isAtEnd = selectedEventIndex >= eventCount - 1;

  return (
    <div className="replay-mode-indicator">
      <div className="replay-mode-row">
        <span className="replay-mode-icon">⏪</span>

        {/* Info display: event count and timestamp */}
        <span className="replay-mode-info">
          <span className="replay-mode-event-count">
            Event {selectedEventIndex + 1} of {eventCount}
          </span>
          {timeSinceFirst != null && (
            <span className="replay-mode-timestamp">
              {formatDuration(timeSinceFirst)}
              {totalDuration != null && totalDuration > 0 && (
                <span className="replay-mode-duration"> / {formatDuration(totalDuration)}</span>
              )}
            </span>
          )}
        </span>

        {/* Navigation buttons */}
        <div className="replay-mode-nav">
          <button
            className="replay-mode-btn"
            onClick={prevEvent}
            disabled={isAtStart}
            title="Previous event (←)"
          >
            ◀
          </button>
          <button
            className="replay-mode-btn"
            onClick={nextEvent}
            disabled={isAtEnd}
            title="Next event (→)"
          >
            ▶
          </button>
        </div>

        {/* Mode toggle */}
        <div className="replay-mode-toggle">
          <button
            className={`replay-mode-toggle-btn ${scrubberMode === 'event' ? 'active' : ''}`}
            onClick={() => setScrubberMode('event')}
            title="Event mode: equal spacing per event"
          >
            #
          </button>
          <button
            className={`replay-mode-toggle-btn ${scrubberMode === 'time' ? 'active' : ''}`}
            onClick={() => setScrubberMode('time')}
            title="Time mode: spacing by timestamp"
          >
            ⏱
          </button>
        </div>

        <button className="replay-mode-exit" onClick={clearReplay}>
          Return to Live
        </button>
      </div>

      {/* Scrubber bar */}
      <div
        className="replay-mode-scrubber"
        ref={scrubberRef}
        onClick={handleScrubberClick}
      >
        <div className="replay-mode-scrubber-track">
          <div
            className="replay-mode-scrubber-fill"
            style={{ width: `${scrubberPosition}%` }}
          />
          <div
            className="replay-mode-scrubber-thumb"
            style={{ left: `${scrubberPosition}%` }}
          />
        </div>
      </div>
    </div>
  );
}
