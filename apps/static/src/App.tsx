// apps/static/src/App.tsx
//
// Root component for the static Vite app. Merges the responsibilities of
// the old Next.js layout.tsx + storeWrapper.tsx: initializes Redux,
// wraps in providers, and renders StaticPage.
//
import React from 'react';
import { Provider, useSelector } from 'react-redux';

import { store, extendSettings, ReduxStoreLoader } from '@/lib/state';
import { initConfig, getConfigBool } from '@/lib/config';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import StaticContentProvider from './StaticContentProvider';
import StaticPage from './StaticPage';

// Injected at build time by Vite define.
declare const __SYSTEM_PMSS__: string;
declare const __STATIC_EVENT_SERVER_URL__: string;
declare const __STATIC_CLASSES__: string[];
declare const __STATIC_CONTENT_NOTICE__: string;

initConfig(__SYSTEM_PMSS__, ['static', ...__STATIC_CLASSES__]);

const eventServerUrl = __STATIC_EVENT_SERVER_URL__ || undefined;

const useWebsocket = !!eventServerUrl || getConfigBool('websocket');

const reduxStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
  websocket: useWebsocket,
  eventServerUrl,
});

/** Gate content on store hydration when persistence is active. */
function StoreGate({ children }: { children: React.ReactNode }) {
  const loaded = useSelector((state: any) => state?.settings?.reduxStoreStatus ?? false);
  if (!loaded) return null;
  return <>{children}</>;
}

export default function App({ definitionKey }: { definitionKey: string }) {
  const content = (
    <StaticContentProvider>
      <StaticPage definitionKey={definitionKey} contentNotice={__STATIC_CONTENT_NOTICE__} />
    </StaticContentProvider>
  );

  return (
    <Provider store={reduxStore}>
      <ReduxStoreLoader />
      {useWebsocket ? <StoreGate>{content}</StoreGate> : content}
    </Provider>
  );
}
