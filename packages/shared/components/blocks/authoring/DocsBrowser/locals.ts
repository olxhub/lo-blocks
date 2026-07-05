// packages/shared/components/blocks/authoring/DocsBrowser/locals.ts
//
// Component-scoped UI-state fields for DocsBrowser, following the Catalog
// block's locals.ts pattern (field declarations live beside the block that
// owns them, keyed per-instance by the standard block state key).

import * as state from '@/lib/state';

/** DocsBrowser fields: selection, search query, sidebar collapse,
 *  per-category expansion.
 *
 *  docsSelected is the selected block name (or `format:name` for a
 *  grammar). It is URL-synced (`?docsbrowser=Markdown`, pushState history
 *  entries — the same mechanism as Course's selectedChild) so sidebar
 *  navigation is client-side, no page reload, while links stay shareable.
 *
 *  docsCategoryOverrides is a Record<category, boolean> of explicit user
 *  toggles. Categories default to closed (except the selected entry's
 *  category); an override wins over both defaults. */
export const docsBrowserFields = state.fields([
  { name: 'docsSelected', url: true, urlDefault: true, urlPush: true },
  'docsSearch',
  'docsSidebarCollapsed',
  'docsCategoryOverrides',
  // Show internal/system blocks. Field-overrideable attribute: the
  // internal= attribute is the authored default, this field is the user's
  // per-session override (sidebar checkbox).
  'docsShowInternal',
]);
