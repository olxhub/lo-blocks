// apps/static/src/App.tsx
//
// Root component for the static Vite app. Merges the responsibilities of
// the old Next.js layout.tsx + storeWrapper.tsx: initializes Redux,
// wraps in providers, and renders StaticPage.
//
import React from 'react';
import { Provider } from 'react-redux';

import { store, extendSettings } from '@/lib/state';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import StaticContentProvider from './StaticContentProvider';
import StaticPage from './StaticPage';

// Injected at build time from content/static.config.json by Vite define.
// Empty string = no event server (websocket disabled).
declare const __STATIC_EVENT_SERVER_URL__: string;
const eventServerUrl = __STATIC_EVENT_SERVER_URL__ || undefined;

const reduxStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
  eventServerUrl,
});

export default function App({ definitionKey }: { definitionKey: string }) {
  return (
    <Provider store={reduxStore}>
      <StaticContentProvider>
        <StaticPage definitionKey={definitionKey} />
      </StaticContentProvider>
    </Provider>
  );
}
