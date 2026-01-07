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
import { useDebugSettings } from '@/lib/state/debugSettings';
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
  const { replayMode, replayEventIndex, setReplayMode, setReplayEventIndex, getEvents } = useDebugSettings();
  const [scrubberMode, setScrubberMode] = useState<ScrubberMode>('event');
  const scrubberRef = useRef<HTMLDivElement>(null);

  // Extract values
  const isActive = replayMode;
  const selectedEventIndex = replayEventIndex >= 0 ? replayEventIndex : 0;
  const events = getEvents();
  const eventCount = events.length;

  // Navigation helpers
  const selectEvent = useCallback((index: number) => {
    setReplayMode(true);
    setReplayEventIndex(index);
  }, [setReplayMode, setReplayEventIndex]);

  const clearReplay = useCallback(() => {
    setReplayMode(false);
    setReplayEventIndex(-1);
  }, [setReplayMode, setReplayEventIndex]);

  const nextEvent = useCallback(() => {
    const count = getEvents().length;
    const current = replayEventIndex < 0 ? 0 : replayEventIndex;
    setReplayEventIndex(Math.min(current + 1, count - 1));
  }, [getEvents, replayEventIndex, setReplayEventIndex]);

  const prevEvent = useCallback(() => {
    const current = replayEventIndex <= 0 ? 0 : replayEventIndex;
    setReplayEventIndex(Math.max(current - 1, 0));
  }, [replayEventIndex, setReplayEventIndex]);

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

  // Compute event positions on the scrubber (for markers)
  const eventPositions = useMemo(() => {
    if (eventCount <= 1) return [0];

    if (scrubberMode === 'event') {
      // Event mode: evenly spaced
      return Array.from({ length: eventCount }, (_, i) => (i / (eventCount - 1)) * 100);
    } else {
      // Time mode: by timestamp
      if (totalDuration == null || totalDuration === 0 || firstTimestamp == null) {
        return Array.from({ length: eventCount }, (_, i) => (i / (eventCount - 1)) * 100);
      }
      return timestamps.map(ts => {
        if (ts == null) return 0;
        return ((ts - firstTimestamp) / totalDuration) * 100;
      });
    }
  }, [scrubberMode, eventCount, totalDuration, firstTimestamp, timestamps]);

  // Find the event index for a given percent position
  const percentToEventIndex = useCallback((percent: number): number => {
    if (eventCount === 0) return 0;
    if (eventCount === 1) return 0;

    if (scrubberMode === 'event') {
      return Math.round(percent * (eventCount - 1));
    } else {
      // Time mode: find closest event
      if (totalDuration == null || totalDuration === 0 || firstTimestamp == null) {
        return Math.round(percent * (eventCount - 1));
      }

      const targetTime = firstTimestamp + percent * totalDuration;
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
      return closestIndex;
    }
  }, [scrubberMode, eventCount, totalDuration, firstTimestamp, timestamps]);

  // Handle scrubber interaction (click or drag)
  const handleScrubberInteraction = useCallback((clientX: number) => {
    if (!scrubberRef.current || eventCount === 0) return;

    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const newIndex = percentToEventIndex(percent);
    selectEvent(newIndex);
  }, [eventCount, percentToEventIndex, selectEvent]);

  // Mouse down starts drag
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleScrubberInteraction(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleScrubberInteraction(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleScrubberInteraction]);

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
        onMouseDown={handleMouseDown}
      >
        <div className="replay-mode-scrubber-track">
          {/* Event markers */}
          {eventPositions.map((pos, idx) => (
            <div
              key={idx}
              className={`replay-mode-scrubber-marker ${idx === selectedEventIndex ? 'active' : ''}`}
              style={{ left: `${pos}%` }}
              title={`Event ${idx + 1}`}
            />
          ))}
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
