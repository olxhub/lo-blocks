// src/app/storeWrapper.tsx
//
// Root wrapper that provides Redux store and replay infrastructure.
//
// Architecture:
//   - Debug settings (panel visibility, replay mode, event index) live in Redux
//   - When replay is active, page content sees a computed historical store
//   - Debug panel always sees live store to control playback
//   - sideEffectFree and logEvent are threaded via props (not context)
//
// Structure:
//   <Provider store={live}>
//     <StoreWrapperInner>        // Reads debug settings, computes replay
//       <ReplayProvider>         // Swaps store for page content when replaying
//         {children}             // Page content
//       </ReplayProvider>
//       <GlobalDebugPanel />     // Always sees live store
//     </StoreWrapperInner>
//   </Provider>
//
'use client';
import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { Provider, useSelector, useStore } from 'react-redux';
import { legacy_createStore as createStore } from 'redux';
import { usePathname } from 'next/navigation';

import * as lo_event from 'lo_event';

import { store, extendSettings, useFieldState } from '@/lib/state';
import { settings } from '@/lib/state/settings';
import { editorFields } from '@/lib/state/editorFields';
import { replayToEvent, filterByContext, LoggedEvent, AppState } from '@/lib/replay';
import { DebugSettingsContext, type DebugSettings } from '@/lib/state/debugSettings';
import GlobalDebugPanel from '@/components/common/debug/GlobalDebugPanel';
import ReplayModeIndicator from '@/components/common/debug/ReplayModeIndicator';
import type { BaselineProps } from '@/lib/types';

// Re-export for backward compatibility
export { useDebugSettings } from '@/lib/state/debugSettings';
export type { DebugSettings } from '@/lib/state/debugSettings';

// Debug settings use their own context - they're developer tooling,
// separate from the app's event context hierarchy
const debugLogEvent = (eventType: string, data?: any) => {
  lo_event.logEvent(eventType, { ...data, context: 'debug' });
};

const reduxStore = store.init({
  extraFields: extendSettings(editorFields)
});

const DEFAULT_REDUX_STORE_ID = 'default';

// =============================================================================
// Redux Store Loader (persists/loads state)
// =============================================================================

function ReduxStoreLoader({ id = DEFAULT_REDUX_STORE_ID }) {
  const reduxStoreLoaded = useSelector((state: any) => state?.settings?.reduxStoreStatus ?? false);
  const lastFetchedIdRef = useRef<string | null>(null);
  const pendingRequestRef = useRef(false);

  useEffect(() => {
    const idChanged = lastFetchedIdRef.current !== id;
    const shouldFetch = (!reduxStoreLoaded && !pendingRequestRef.current) || idChanged;

    if (shouldFetch) {
      lo_event.logEvent('save_setting', { reduxID: id });
      lo_event.logEvent('fetch_blob', { reduxID: id });
      lastFetchedIdRef.current = id;
      pendingRequestRef.current = !reduxStoreLoaded;
    }

    if (reduxStoreLoaded) {
      pendingRequestRef.current = false;
    }
  }, [id, reduxStoreLoaded]);

  return null;
}

// =============================================================================
// Helper: Get events from window.__events
// =============================================================================

export function getEvents(): LoggedEvent[] {
  if (typeof window !== 'undefined' && (window as any).__events) {
    return (window as any).__events.getEvents() ?? [];
  }
  return [];
}

// =============================================================================
// Replay Store Creation
// =============================================================================

function createReplayStore(state: AppState) {
  const wrappedState = { application_state: state };
  const noopReducer = () => wrappedState;
  return createStore(noopReducer, wrappedState);
}

// =============================================================================
// Replay Provider (swaps store when replay is active)
// =============================================================================

interface ReplayProviderProps {
  children: React.ReactNode;
  replayMode: boolean;
  replayEventIndex: number;
}

function ReplayProvider({ children, replayMode, replayEventIndex }: ReplayProviderProps) {
  const liveStore = useStore();

  // Compute replay store when replay is active
  // Filter to 'preview' context - excludes debug events, studio events, etc.
  const replayStore = useMemo(() => {
    if (!replayMode || replayEventIndex < 0) return null;

    const allEvents = getEvents();
    const events = filterByContext(allEvents, 'preview');
    if (events.length === 0) return null;

    const state = replayToEvent(events, replayEventIndex + 1);
    return createReplayStore(state);
  }, [replayMode, replayEventIndex]);

  const activeStore = replayMode && replayStore ? replayStore : liveStore;

  return (
    <Provider store={activeStore}>
      {children}
    </Provider>
  );
}

// =============================================================================
// Inner Wrapper (reads debug settings from Redux)
// =============================================================================

interface StoreWrapperInnerProps {
  children: React.ReactNode;
  reduxID: string;
}

function StoreWrapperInner({ children, reduxID }: StoreWrapperInnerProps) {
  // Read debug settings from Redux (using debugLogEvent with "debug" context)
  // These are separate from app's event context hierarchy.
  // Minimal BaselineProps: only runtime.logEvent is used for system-scope settings.
  const debugProps = {
    runtime: { logEvent: debugLogEvent, store: reduxStore },
  } as BaselineProps;

  const [panelOpen, setPanelOpen] = useFieldState(
    debugProps,
    settings.debugPanel,
    false
  );
  const [replayMode, setReplayMode] = useFieldState(
    debugProps,
    settings.debugReplayMode,
    false
  );
  const [replayEventIndex, setReplayEventIndex] = useFieldState(
    debugProps,
    settings.debugReplayEventIndex,
    -1
  );

  // Stable getEvents callback - returns filtered events (preview context only)
  const getEventsCallback = useCallback(() => {
    return filterByContext(getEvents(), 'preview');
  }, []);

  // Debug settings context value
  const debugSettings = useMemo(() => ({
    panelOpen,
    setPanelOpen,
    replayMode,
    replayEventIndex,
    setReplayMode,
    setReplayEventIndex,
    getEvents: getEventsCallback,
  }), [panelOpen, setPanelOpen, replayMode, replayEventIndex, setReplayMode, setReplayEventIndex, getEventsCallback]);

  return (
    <DebugSettingsContext.Provider value={debugSettings}>
      <ReduxStoreLoader id={reduxID} />
      <ReplayModeIndicator />
      <ReplayProvider replayMode={replayMode} replayEventIndex={replayEventIndex}>
        {children}
      </ReplayProvider>
      <GlobalDebugPanel />
    </DebugSettingsContext.Provider>
  );
}

// =============================================================================
// Main StoreWrapper
// =============================================================================

const StoreWrapper = ({ children, reduxID = DEFAULT_REDUX_STORE_ID }) => {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) {
      lo_event.setFieldSet([{ page: pathname }]);
    }
  }, [pathname]);

  return (
    <Provider store={reduxStore}>
      <StoreWrapperInner reduxID={reduxID}>
        {children}
      </StoreWrapperInner>
    </Provider>
  );
};

export default StoreWrapper;
