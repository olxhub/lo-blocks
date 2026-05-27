// apps/static/src/App.tsx
//
// Root component for the static Vite app. Merges the responsibilities of
// the old Next.js layout.tsx + storeWrapper.tsx: initializes Redux,
// wraps in providers, and renders StaticPage.
//
import React from 'react';
import { Provider } from 'react-redux';

import { store, extendSettings } from '@/lib/state';
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

const reduxStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
  websocket: !!eventServerUrl || getConfigBool('websocket'),
  eventServerUrl,
});

export default function App({ definitionKey }: { definitionKey: string }) {
  return (
    <Provider store={reduxStore}>
      <StaticContentProvider>
        <StaticPage definitionKey={definitionKey} contentNotice={__STATIC_CONTENT_NOTICE__} />
      </StaticContentProvider>
    </Provider>
  );
}
