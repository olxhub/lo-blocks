// apps/client/src/App.tsx
//
// Root component. Initializes Redux store and renders the routed page.
//
import React from 'react';
import { Provider } from 'react-redux';

import { store, extendSettings } from '@/lib/state';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import type { Route } from './router';
import PreviewPage from './pages/PreviewPage';

const reduxStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
});

export default function App({ route }: { route: Route }) {
  let page: React.ReactNode;

  switch (route.page) {
    case 'preview':
      page = <PreviewPage id={route.id} />;
      break;
    case 'notFound':
      page = (
        <div style={{ padding: '2rem' }}>
          <h1>Not Found</h1>
          <p>No route for <code>{route.path}</code></p>
        </div>
      );
      break;
  }

  return <Provider store={reduxStore}>{page}</Provider>;
}
