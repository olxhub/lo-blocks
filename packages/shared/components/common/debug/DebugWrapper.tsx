// packages/shared/components/common/debug/DebugWrapper.tsx
//
// Shared debug infrastructure wrapper. Provides:
//   - DebugSettingsContext (panel visibility, replay state)
//   - GlobalDebugPanel (Ctrl+` keyboard shortcut)
//   - ReplayProvider (swaps Redux store during replay)
//   - ReplayModeIndicator (scrubber UI)
//   - ThemeSync (DOM attribute sync)
//
// When debug-panel is disabled via PMSS, renders children only — no debug
// components are mounted and the module-level imports are the only cost.
//
// Usage (inside a Redux <Provider>):
//   <DebugWrapper>{children}</DebugWrapper>
//
'use client';

import React, { useMemo, useCallback } from 'react';
import { Provider, useStore } from 'react-redux';
import { legacy_createStore as createStore } from 'redux';
import * as lo_event from 'lo_event';

import { useFieldState } from '@/lib/state';
import { settings } from '@/lib/state/settings';
import { DebugSettingsContext } from '@/lib/state/debugSettings';
import { replayToEvent, filterByContext, type LoggedEvent } from '@/lib/replay';
import type { AppState } from '@/lib/types';
import { resolveConfig } from '@/lib/config';
import type { BaselineProps } from '@/lib/types';

import GlobalDebugPanel from './GlobalDebugPanel';
import ReplayModeIndicator from './ReplayModeIndicator';
import ThemeSync from './ThemeSync';

// Debug settings use their own event context, separate from the app's hierarchy.
const debugLogEvent = (eventType: string, data?: any) => {
  lo_event.logEvent(eventType, { ...data, context: 'debug' });
};

function getEvents(): LoggedEvent[] {
  if (typeof window !== 'undefined' && (window as any).__events) {
    return (window as any).__events.getEvents() ?? [];
  }
  return [];
}

function createReplayStore(state: AppState) {
  const wrappedState = { application_state: state };
  const noopReducer = () => wrappedState;
  return createStore(noopReducer, wrappedState);
}

// --- Replay Provider ---------------------------------------------------------

function ReplayProvider({
  children, replayMode, replayEventIndex,
}: {
  children: React.ReactNode;
  replayMode: boolean;
  replayEventIndex: number;
}) {
  const liveStore = useStore();

  const replayStore = useMemo(() => {
    if (!replayMode || replayEventIndex < 0) return null;
    const events = filterByContext(getEvents(), 'preview');
    if (events.length === 0) return null;
    return createReplayStore(replayToEvent(events, replayEventIndex + 1));
  }, [replayMode, replayEventIndex]);

  const activeStore = replayMode && replayStore ? replayStore : liveStore;

  // Store-binding invariant: hooks read through the Provider, so swapping it
  // here retargets every hook in the subtree to the replay store. runtime.store
  // deliberately stays live — its readers are content lookups (identical in
  // both stores) and the write path (a replay preview doesn't write; if
  // something does, live is the right target). Don't "fix" either side.
  return <Provider store={activeStore}>{children}</Provider>;
}

// --- Inner (reads debug settings from Redux) ---------------------------------

function DebugWrapperInner({
  children, store: reduxStore,
}: {
  children: React.ReactNode;
  store: any;
}) {
  const debugProps = {
    runtime: { logEvent: debugLogEvent, store: reduxStore },
  } as BaselineProps;

  const [panelOpen, setPanelOpen] = useFieldState(debugProps, settings.debugPanel, false);
  const [replayMode, setReplayMode] = useFieldState(debugProps, settings.debugReplayMode, false);
  const [replayEventIndex, setReplayEventIndex] = useFieldState(
    debugProps, settings.debugReplayEventIndex, -1,
  );

  const getEventsCallback = useCallback(() => filterByContext(getEvents(), 'preview'), []);

  const debugSettings = useMemo(() => ({
    panelOpen, setPanelOpen,
    replayMode, replayEventIndex,
    setReplayMode, setReplayEventIndex,
    getEvents: getEventsCallback,
  }), [panelOpen, setPanelOpen, replayMode, replayEventIndex,
       setReplayMode, setReplayEventIndex, getEventsCallback]);

  return (
    <DebugSettingsContext.Provider value={debugSettings}>
      <ReplayModeIndicator />
      <ReplayProvider replayMode={replayMode} replayEventIndex={replayEventIndex}>
        {children}
      </ReplayProvider>
      <GlobalDebugPanel />
      <ThemeSync />
    </DebugSettingsContext.Provider>
  );
}

// --- Public wrapper ----------------------------------------------------------

/**
 * Debug infrastructure wrapper. Must be rendered inside a Redux <Provider>.
 *
 * When PMSS `debug-panel` is false, renders only children — no debug
 * components, no replay overhead.
 *
 * @param store - The Redux store instance (needed for debugProps)
 */
export default function DebugWrapper({
  children, store: reduxStore,
}: {
  children: React.ReactNode;
  store: any;
}) {
  if (resolveConfig({}, 'debug-panel') !== 'true') {
    return <>{children}</>;
  }

  return (
    <DebugWrapperInner store={reduxStore}>
      {children}
    </DebugWrapperInner>
  );
}
