// src/lib/state/replayContext.tsx
//
// Replay context - React context for controlling time-travel replay.
//
// Provides a way for the debug panel to control whether the UI is rendering
// from live state or from a historical point in the event stream.
//
// Architecture:
// - ReplayContext: Tracks replay state (active, selected event index, computed state)
// - ReplayProvider: Conditionally wraps children with a nested Redux Provider
// - When replay is active, useSelector sees the replay store instead of live store
// - When replay is inactive, everything works normally
//
// TODO: Should this be a context? In redux? Or simply threaded through props?
//
// We DO want this to be possible to localize. E.g., to let students
// review their own working processes. So we do want a `<Replay>`
// block eventually. However, that could be prop-threaded without a
// context too.


'use client';

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { Provider } from 'react-redux';
import { legacy_createStore as createStore } from 'redux';
import { replayToEvent, LoggedEvent, AppState } from '@/lib/replay';

// =============================================================================
// Types
// =============================================================================

interface ReplayContextValue {
  // Is replay mode active?
  isActive: boolean;

  // The selected event index (-1 = live, 0+ = viewing state after that event)
  selectedEventIndex: number;

  // Enter replay mode at a specific event
  selectEvent: (index: number) => void;

  // Exit replay mode
  clearReplay: () => void;

  // Toggle replay for an event (click same event to exit)
  toggleEvent: (index: number) => void;
}

// =============================================================================
// Context
// =============================================================================

const ReplayContext = createContext<ReplayContextValue | null>(null);

export function useReplayContext(): ReplayContextValue {
  const ctx = useContext(ReplayContext);
  if (!ctx) {
    throw new Error('useReplayContext must be used within a ReplayControlProvider');
  }
  return ctx;
}

// Optional hook that returns null if not in a replay context (for conditional use)
export function useReplayContextOptional(): ReplayContextValue | null {
  return useContext(ReplayContext);
}

// =============================================================================
// Replay Store
// =============================================================================

/**
 * Create a replay store with the given state.
 *
 * The replay store uses a no-op reducer - state is set directly, not via events.
 * This prevents any dispatched events from modifying the historical view.
 */
function createReplayStore(state: AppState) {
  // Wrap state in application_state to match live store shape
  const wrappedState = { application_state: state };

  // No-op reducer: always returns the same state regardless of action
  const noopReducer = () => wrappedState;

  return createStore(noopReducer, wrappedState);
}

// =============================================================================
// Providers
// =============================================================================

interface ReplayControlProviderProps {
  children: React.ReactNode;
}

/**
 * Provides replay control context without actually swapping stores.
 *
 * This should wrap the DebugPanel and page content. The DebugPanel uses
 * the context to control replay, and ReplayStoreProvider (wrapping just
 * page content) actually swaps the store.
 */
export function ReplayControlProvider({ children }: ReplayControlProviderProps) {
  const [selectedEventIndex, setSelectedEventIndex] = useState(-1);
  const isActive = selectedEventIndex >= 0;

  const selectEvent = useCallback((index: number) => {
    setSelectedEventIndex(index);
  }, []);

  const clearReplay = useCallback(() => {
    setSelectedEventIndex(-1);
  }, []);

  const toggleEvent = useCallback((index: number) => {
    setSelectedEventIndex(prev => prev === index ? -1 : index);
  }, []);

  const value: ReplayContextValue = useMemo(() => ({
    isActive,
    selectedEventIndex,
    selectEvent,
    clearReplay,
    toggleEvent,
  }), [isActive, selectedEventIndex, selectEvent, clearReplay, toggleEvent]);

  return (
    <ReplayContext.Provider value={value}>
      {children}
    </ReplayContext.Provider>
  );
}

interface ReplayStoreProviderProps {
  children: React.ReactNode;
  getEvents: () => LoggedEvent[];  // Function to get events from event logger
}

/**
 * Conditionally wraps children with a replay store when replay is active.
 *
 * When replay is active, creates a Redux store with the historical state
 * and wraps children in a new Provider. Components using useSelector
 * will see the replay state instead of live state.
 *
 * When replay is inactive, just renders children (they see the outer Provider).
 */
export function ReplayStoreProvider({ children, getEvents }: ReplayStoreProviderProps) {
  const replayCtx = useReplayContextOptional();

  // Compute replay store when replay is active
  const replayStore = useMemo(() => {
    if (!replayCtx?.isActive) return null;

    const events = getEvents();
    if (events.length === 0) return null;

    // Compute state at the selected event
    const state = replayToEvent(events, replayCtx.selectedEventIndex + 1);
    return createReplayStore(state);
  }, [replayCtx?.isActive, replayCtx?.selectedEventIndex, getEvents]);

  // When replay is active and we have a store, wrap children in new Provider
  if (replayCtx?.isActive && replayStore) {
    return (
      <Provider store={replayStore}>
        {children}
      </Provider>
    );
  }

  // Otherwise, just render children (they see the outer Provider)
  return <>{children}</>;
}
