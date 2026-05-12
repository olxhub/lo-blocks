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

const reduxStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
});

export default function App({ olxKey }: { olxKey: string }) {
  return (
    <Provider store={reduxStore}>
      <StaticContentProvider>
        <StaticPage olxKey={olxKey} />
      </StaticContentProvider>
    </Provider>
  );
}
