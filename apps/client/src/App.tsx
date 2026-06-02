// apps/client/src/App.tsx
//
// Root component. Initializes Redux store and renders the routed page.
//
import React from 'react';

import { store, extendSettings } from '@/lib/state';
import { getConfigBool } from '@/lib/config';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import StoreShell from '@/components/common/StoreShell';
import type { Route } from './router';
import PreviewPage from './pages/PreviewPage';

const reduxStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
  websocket: getConfigBool('websocket'),
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

  return (
    <StoreShell store={reduxStore}>
      {page}
    </StoreShell>
  );
}
