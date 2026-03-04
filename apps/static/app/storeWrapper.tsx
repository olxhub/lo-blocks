// apps/static/app/storeWrapper.tsx
//
// Minimal Redux store wrapper for static builds.
// No replay infrastructure, no debug panel -- just the store and lo_event.
//
'use client';
import React from 'react';
import { Provider } from 'react-redux';

import { store, extendSettings } from '@/lib/state';
import { DebugSettingsContext } from '@/lib/state/debugSettings';

// Must pass settings so SET_LOCALE (and other settings events) are registered
// with reduxLogger. Without this, locale never gets set and the page hangs
// on "Loading language settings..."
//
// websocket: false — no event server in static builds. Without this, lo_event
// queues events waiting for a websocket ACK that never comes.
const reduxStore = store.init({
  extraFields: extendSettings([]),
  websocket: false,
});

// Static builds don't have debug/replay infrastructure.
// Provide a no-op context so any code that reads it doesn't crash.
const staticDebugSettings = {
  panelOpen: false,
  setPanelOpen: () => {},
  replayMode: false,
  replayEventIndex: -1,
  setReplayMode: () => {},
  setReplayEventIndex: () => {},
  getEvents: () => [],
};

export default function StoreWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={reduxStore}>
      <DebugSettingsContext.Provider value={staticDebugSettings}>
        {children}
      </DebugSettingsContext.Provider>
    </Provider>
  );
}
