// apps/client/src/App.tsx
//
// Root component. Initializes Redux store and renders the routed page.
//
import React from 'react';

import { store, extendSettings } from '@/lib/state';
import { editorFields } from '@/lib/state/editorFields';
import { chatFields } from '@/lib/state/chatFields';
import { getConfigBool } from '@/lib/config';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import StoreShell from '@/components/common/StoreShell';
import type { Route } from './router';
import PreviewPage from './pages/PreviewPage';
import CatalogPage from './pages/CatalogPage';
import RepoDetailPage from './pages/RepoDetailPage';
import DocsPage from './pages/DocsPage';
import StudioPage from './pages/StudioPage';

const reduxStore = store.init({
  // editorFields/chatFields must be registered or the redux logger silently
  // drops their events (Studio's working-tree buffers; chat transcripts).
  extraFields: extendSettings(editorFields).extend(chatFields),
  blockRegistry: BLOCK_REGISTRY,
  websocket: getConfigBool('websocket'),
  tabSync: getConfigBool('tab-sync'),
});

export default function App({ route }: { route: Route }) {
  let page: React.ReactNode;

  switch (route.page) {
    case 'preview':
      page = <PreviewPage id={route.id} />;
      break;
    case 'catalog':
      page = <CatalogPage />;
      break;
    case 'repo':
      page = <RepoDetailPage origin={route.origin} />;
      break;
    case 'docs':
      page = <DocsPage block={route.block} />;
      break;
    case 'studio':
      page = <StudioPage />;
      break;
    case 'notFound':
      page = (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1>404 — Not Found</h1>
          <p>
            No content for <code>{route.path}</code>
          </p>
          {route.reason && (
            <p style={{ color: 'var(--lo-text-secondary, #64748b)' }}>
              {route.reason}
            </p>
          )}
          {route.detail && (
            <details style={{ marginTop: '0.5rem', color: 'var(--lo-text-secondary, #64748b)', fontSize: '0.85rem' }}>
              <summary>Technical details</summary>
              <code style={{ display: 'block', marginTop: '0.25rem' }}>{route.detail}</code>
            </details>
          )}
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
