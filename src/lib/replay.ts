// src/lib/replay.ts
//
// Pure replay utilities for event log analysis.
//
// This module provides pure functions for replaying event logs through the
// Redux reducer WITHOUT side effects. Unlike the full lo_event stack, these
// functions don't modify global state or dispatch events - they just compute
// what state would look like at any point in an event stream.
//
// Use cases:
// - Debug panel "time travel" - click an event to see state at that point
// - CLI replay script - analyze captured sessions
// - Test infrastructure - verify state after sequences of events
// - Teacher replay tool - review student sessions
//
// The key abstraction: replayToEvent(events, n) returns the state that would
// exist after processing events 0..n-1. This enables scrubbing through
// an event stream without affecting live application state.
//

import { updateResponseReducer } from './state/store';
import { initialOlxJsonState } from './state/olxjson';

// =============================================================================
// Types
// =============================================================================

/**
 * Application state shape (what updateResponseReducer manages).
 * This is the state INSIDE application_state when using lo_event's Redux wrapper.
 * For pure replay, we work with this directly without the wrapper.
 */
export interface AppState {
  component: Record<string, Record<string, any>>;
  componentSetting: Record<string, Record<string, any>>;
  system: Record<string, any>;
  storage: Record<string, Record<string, any>>;
  olxjson: Record<string, Record<string, any>>;
  chat: Record<string, { messages: any[]; status: string }>;
}

/**
 * An event from the event log.
 * Events have `event` (type) plus payload fields.
 */
export interface LoggedEvent {
  event: string;
  id?: string;
  scope?: string;
  context?: string;  // Hierarchical context like 'preview.quiz.input1'
  metadata?: {
    iso_ts?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Event types that must be included regardless of context (essential for state reconstruction).
// Without these, replayed state is incomplete: LOAD_OLXJSON provides content,
// SET_LOCALE determines which language variant to render.
const CONTEXT_INDEPENDENT_EVENTS = new Set([
  'LOAD_OLXJSON',
  'OLXJSON_LOADING',
  'OLXJSON_ERROR',
  'CLEAR_OLXJSON',
  'SET_LOCALE',
]);

/**
 * Filter events by context prefix.
 *
 * Use this to get events for a specific context (e.g., 'preview' shows only
 * preview-related events, filtering out debug panel events, studio events, etc.)
 *
 * Content events (LOAD_OLXJSON, etc.) are always included regardless of context
 * since they're essential for state reconstruction during replay.
 *
 * @param events - Raw event list
 * @param prefix - Context prefix to match (e.g., 'preview', 'studio')
 * @returns Filtered events where context starts with prefix OR are content events
 */
export function filterByContext(events: LoggedEvent[], prefix: string): LoggedEvent[] {
  return events.filter(e =>
    e.context?.startsWith(prefix) || CONTEXT_INDEPENDENT_EVENTS.has(e.event)
  );
}

/**
 * State snapshot at a point in the event stream.
 */
export interface StateSnapshot {
  eventIndex: number;
  event: LoggedEvent | null;  // null for initial state (index -1)
  state: AppState;
}

// =============================================================================
// Initial State
// =============================================================================

/**
 * Initial state for pure replay.
 * Matches the initial state used by the live store.
 */
export const initialReplayState: AppState = {
  component: {},
  componentSetting: {},
  system: {},
  storage: {},
  olxjson: initialOlxJsonState,
  chat: {},
};

// =============================================================================
// Core Replay Functions
// =============================================================================

/**
 * Replay events through the reducer, returning state at position `upTo`.
 *
 * @param events - Array of logged events
 * @param upTo - Number of events to process (0 = initial state, events.length = final state)
 * @returns The computed state after processing events 0..upTo-1
 *
 * @example
 * // Get initial state
 * replayToEvent(events, 0)
 *
 * // Get state after first event
 * replayToEvent(events, 1)
 *
 * // Get final state
 * replayToEvent(events)  // or replayToEvent(events, events.length)
 */
export function replayToEvent(events: LoggedEvent[], upTo?: number): AppState {
  const limit = upTo ?? events.length;
  let state = initialReplayState;

  for (let i = 0; i < Math.min(limit, events.length); i++) {
    state = updateResponseReducer(state, events[i]);
  }

  return state;
}

/**
 * Replay all events, returning snapshots at each step.
 *
 * Useful for:
 * - Building a scrubber UI (have all states pre-computed)
 * - Analyzing state changes over time
 * - Finding when a particular value changed
 *
 * @param events - Array of logged events
 * @returns Array of snapshots: [initial, after event 0, after event 1, ...]
 *
 * @example
 * const snapshots = replayWithSnapshots(events);
 * // snapshots[0] is initial state (eventIndex: -1)
 * // snapshots[1] is state after events[0]
 * // snapshots[n+1] is state after events[n]
 */
export function replayWithSnapshots(events: LoggedEvent[]): StateSnapshot[] {
  const snapshots: StateSnapshot[] = [{
    eventIndex: -1,
    event: null,
    state: initialReplayState,
  }];

  let state = initialReplayState;
  for (let i = 0; i < events.length; i++) {
    state = updateResponseReducer(state, events[i]);
    snapshots.push({
      eventIndex: i,
      event: events[i],
      state,
    });
  }

  return snapshots;
}

/**
 * Find the index where a field first reaches a specific value.
 *
 * Useful for debugging: "when did correct become 'correct'?"
 *
 * @param events - Array of logged events
 * @param predicate - Function to check if state matches condition
 * @returns Event index where predicate first returns true, or -1 if never
 *
 * @example
 * // Find when user got the answer correct
 * const idx = findEventWhere(events, state =>
 *   state.component['grader1']?.correct === 'correct'
 * );
 */
export function findEventWhere(
  events: LoggedEvent[],
  predicate: (state: AppState) => boolean
): number {
  let state = initialReplayState;

  for (let i = 0; i < events.length; i++) {
    state = updateResponseReducer(state, events[i]);
    if (predicate(state)) {
      return i;
    }
  }

  return -1;
}

/**
 * Get the value of a specific field at each event.
 *
 * @param events - Array of logged events
 * @param selector - Function to extract the value of interest from state
 * @returns Array of { eventIndex, value } for each event
 *
 * @example
 * // Track how 'value' changed over time
 * const history = getFieldHistory(events, state =>
 *   state.component['input1']?.value
 * );
 */
export function getFieldHistory<T>(
  events: LoggedEvent[],
  selector: (state: AppState) => T
): Array<{ eventIndex: number; event: LoggedEvent; value: T }> {
  const history: Array<{ eventIndex: number; event: LoggedEvent; value: T }> = [];
  let state = initialReplayState;

  for (let i = 0; i < events.length; i++) {
    state = updateResponseReducer(state, events[i]);
    history.push({
      eventIndex: i,
      event: events[i],
      value: selector(state),
    });
  }

  return history;
}

// =============================================================================
// Diff Utilities
// =============================================================================

/**
 * Compute what changed between two states.
 *
 * Returns a simplified diff focusing on component state changes.
 * Not a full deep diff - just shows which component IDs have different values.
 *
 * @param before - State before
 * @param after - State after
 * @returns Object describing changes in each scope
 */
export function diffStates(before: AppState, after: AppState): {
  component: { added: string[]; removed: string[]; changed: string[] };
  system: { changed: string[] };
} {
  const componentDiff = {
    added: [] as string[],
    removed: [] as string[],
    changed: [] as string[],
  };

  const beforeKeys = new Set(Object.keys(before.component));
  const afterKeys = new Set(Object.keys(after.component));

  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      componentDiff.added.push(key);
    } else if (JSON.stringify(before.component[key]) !== JSON.stringify(after.component[key])) {
      componentDiff.changed.push(key);
    }
  }

  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      componentDiff.removed.push(key);
    }
  }

  const systemDiff = {
    changed: [] as string[],
  };

  for (const key of Object.keys(after.system)) {
    if (JSON.stringify(before.system[key]) !== JSON.stringify(after.system[key])) {
      systemDiff.changed.push(key);
    }
  }

  return { component: componentDiff, system: systemDiff };
}
