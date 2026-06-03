// apps/static/src/App.tsx
//
// Root component for the static Vite app. Initializes Redux,
// wraps in providers, and renders StaticPage.
//
import React, { useState, useEffect } from 'react';

import { store, extendSettings, useLoaded } from '@/lib/state';
import { initConfig, getConfigBool } from '@/lib/config';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import StoreShell from '@/components/common/StoreShell';
import Spinner from '@/components/common/Spinner';
import StaticContentProvider from './StaticContentProvider';
import StaticPage from './StaticPage';

// How long to wait for the server to hydrate persisted state before
// giving up and showing an error. The happy path (auth echo + fetch_blob
// round-trip) is sub-second; this is a backstop for an unreachable or
// unresponsive event server.
const HYDRATION_TIMEOUT_MS = 15000;

// Injected at build time by Vite define.
declare const __SYSTEM_PMSS__: string;
declare const __STATIC_EVENT_SERVER_URL__: string;
declare const __STATIC_CLASSES__: string[];
declare const __STATIC_CONTENT_NOTICE__: string;

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
initConfig(__SYSTEM_PMSS__, ['static', env, ...__STATIC_CLASSES__]);

const eventServerUrl = __STATIC_EVENT_SERVER_URL__ || undefined;

const useWebsocket = !!eventServerUrl || getConfigBool('websocket');

const reduxStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
  websocket: useWebsocket,
  eventServerUrl,
});

/**
 * Gate content on store hydration when persistence is active.
 *
 * Until the server's blob snapshot lands we show a spinner. If hydration
 * does not complete within HYDRATION_TIMEOUT_MS (unreachable/unresponsive
 * event server, failed auth), we show an error page rather than blocking
 * on a blank screen forever.
 *
 * TODO: reconnect logic / retry from the error state.
 */
function StoreGate({ children }: { children: React.ReactNode }) {
  const loaded = useLoaded();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setTimedOut(true), HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  if (loaded) return <>{children}</>;

  if (timedOut) {
    return (
      <div style={{ padding: '2rem', color: 'red' }}>
        Failed to load your saved progress: the activity server did not respond.
        Please check your connection and reload the page.
      </div>
    );
  }

  return <Spinner>Loading your progress...</Spinner>;
}

export default function App({ definitionKey }: { definitionKey: string }) {
  const content = (
    <StaticContentProvider>
      <StaticPage definitionKey={definitionKey} contentNotice={__STATIC_CONTENT_NOTICE__} />
    </StaticContentProvider>
  );

  return (
    <StoreShell store={reduxStore}>
      {useWebsocket ? <StoreGate>{content}</StoreGate> : content}
    </StoreShell>
  );
}
