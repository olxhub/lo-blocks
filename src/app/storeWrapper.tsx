// src/app/storeWrapper.tsx
//
// Root wrapper that provides Redux store and replay infrastructure.
//
// Structure:
//   <Provider store={live}>           // Main Redux store
//     <ReplayControlProvider>         // Replay state management
//       <ReplayStoreProvider>         // Conditionally swaps store for page content
//         {children}                  // Page content (sees replay store when active)
//       </ReplayStoreProvider>
//       <GlobalDebugPanel />          // Debug panel (always sees live store)
//     </ReplayControlProvider>
//   </Provider>
//
// When replay is active, page content renders from historical state while
// the debug panel continues to work with live state to control playback.
//
'use client';
import React from 'react';
import { useEffect, useRef, useCallback } from 'react';

import { Provider, useSelector } from 'react-redux';

import * as lo_event from 'lo_event';

import { store, extendSettings } from '@/lib/state';
import { editorFields } from '@/lib/state/editorFields';
import { ReplayControlProvider, ReplayStoreProvider } from '@/lib/state/replayContext';
import GlobalDebugPanel from '@/components/common/debug/GlobalDebugPanel';
import ReplayModeIndicator from '@/components/common/debug/ReplayModeIndicator';
import type { LoggedEvent } from '@/lib/replay';

const reduxStore = store.init({
  extraFields: extendSettings(editorFields)
});

const DEFAULT_REDUX_STORE_ID = 'default';

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

// Helper to get events from window.__events
function getEvents(): LoggedEvent[] {
  if (typeof window !== 'undefined' && (window as any).__events) {
    return (window as any).__events.getEvents() ?? [];
  }
  return [];
}

const StoreWrapper = ({ children, reduxID = DEFAULT_REDUX_STORE_ID }) => {
  // Stable callback reference for getEvents
  const getEventsCallback = useCallback(getEvents, []);

  return (
    <Provider store={reduxStore}>
      <ReduxStoreLoader id={reduxID} />
      <ReplayControlProvider>
        <ReplayModeIndicator />
        <ReplayStoreProvider getEvents={getEventsCallback}>
          {children}
        </ReplayStoreProvider>
        <GlobalDebugPanel />
      </ReplayControlProvider>
    </Provider>
  );
};

export default StoreWrapper;
