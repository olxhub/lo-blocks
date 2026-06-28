// apps/client/src/pages/CatalogPage.tsx
//
// The author front page (the new `/`, served at /catalog during migration).
// Renders the Catalog block through the standard block pipeline (RenderOLX).
// All the UI lives in CatalogView (packages/shared/components/catalog),
// wrapped as a block at blocks/navigation/Catalog.

import RenderOLX from '@/components/common/RenderOLX';
import { asContentNamespace, asStateKey } from '@/lib/types/id-grammar';

export default function CatalogPage() {
  return (
    <RenderOLX
      ns={asContentNamespace('system')}
      id={asStateKey('system/catalog')}
      inline='<Catalog id="catalog"/>'
      eventContext="catalog"
    />
  );
}
