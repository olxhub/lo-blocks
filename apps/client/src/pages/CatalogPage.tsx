// apps/client/src/pages/CatalogPage.tsx
//
// The author front page (the new `/`, served at /catalog during migration).
// All the UI is the shared CatalogView (packages/shared/components/catalog),
// which reads the get_repositories MCP tool via useCatalog. This page is just
// the route's entry point.

import CatalogView from '@/components/catalog/CatalogView';

export default function CatalogPage() {
  return <CatalogView />;
}
