// apps/client/src/pages/CatalogPage.tsx
//
// The author front page, served at `/`.
// Renders the Catalog block through the standard block pipeline (RenderOLX).
// All the UI lives in CatalogView (packages/shared/components/catalog),
// wrapped as a block at blocks/authoring/Catalog.

import RenderOLX from '@/components/common/RenderOLX';
import { asContentNamespace, asStateKey } from '@/lib/types/id-grammar';
import { CATALOG_ID } from '@/components/blocks/authoring/Catalog/locals';

export default function CatalogPage() {
  return (
    <RenderOLX
      ns={asContentNamespace('system')}
      id={asStateKey('system/catalog')}
      inline={`<Catalog id="${CATALOG_ID}"/>`}
      eventContext="catalog"
    />
  );
}
