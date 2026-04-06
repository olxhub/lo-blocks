// apps/static/app/storeWrapper.tsx
//
// Minimal Redux store wrapper for static builds.
// No replay infrastructure, no debug panel -- just the store and lo_event.
//
// Debug settings are not provided here. useDebugSettings() returns safe
// defaults (replay off, panel closed) when no provider is present.
//
'use client';
import React from 'react';
import { Provider } from 'react-redux';

import { store, extendSettings } from '@/lib/state';

// Must pass settings so SET_LOCALE (and other settings events) are registered
// with reduxLogger. Without this, locale never gets set and the page hangs
// on "Loading language settings..."
//
// Websocket and other per-profile settings are resolved via PMSS
// (NEXT_PUBLIC_APP_PROFILE=static in next.config.mjs).
const reduxStore = store.init({
  extraFields: extendSettings([]),
});

export default function StoreWrapper({ children }: { children: React.ReactNode }) {
  return <Provider store={reduxStore}>{children}</Provider>;
}
