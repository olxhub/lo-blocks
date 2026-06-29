// Catalog block — author catalog listing repositories and their launchables.
//
// Usage:
//   <Catalog id="catalog" />
//
// This block wraps the existing CatalogView component, making the catalog
// available through the standard block pipeline. The /catalog route serves
// this block via RenderOLX.
//
// Fields (all component-scoped):
//
//   Catalog-level (keyed by Catalog instance ID):
//     catalogScope — filter scope (all/mine/community)
//     catalogQuery — search query string
//     catalogSort  — sort order (name/activities)
//
//   Per-repo-card (keyed by scoped idPrefix via scopedRepoProps):
//     expanded   — whether the compact card's activity list is expanded inline
//     showBlocks — whether the building-blocks section is visible (full mode)
//
// Each repo card gets a scoped Redux key (e.g., "catalog:#file_3acontent:expanded")
// via the Annotate pattern: scopedRepoProps(props, origin) extends the idPrefix.

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Catalog from '@/components/catalog/CatalogView';
import { catalogFields, repoCardFields } from './locals';

// Re-export locals for consumers.
export { catalogFields, repoCardFields, scopedRepoProps, encodeOriginForId, decodeOriginFromId } from './locals';

const Catalog = dev({
  ...parsers.ignore(),
  name: 'Catalog',
  description: 'Author catalog — lists repositories and their launchables.',
  component: _Catalog,
  fields: catalogFields.extend(repoCardFields),
});

export default Catalog;
