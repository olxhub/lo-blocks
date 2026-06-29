// packages/shared/components/blocks/navigation/Catalog/locals.ts
//
// Shared helpers for the Catalog/RepoCard block family.
//
// Exports:
//   repoCardFields   — component-scoped fields for per-repo-card state
//   encodeOriginForId — encode a repo origin into a valid scope marker
//   decodeOriginFromId — reverse of encodeOriginForId
//   scopedRepoProps   — build RuntimeProps scoped to a specific repo
//
// CatalogView, SearchResults, and RepoDetail all import from here to
// create scoped props for RepoCard instances. The field declarations live
// here (not on a separate RepoCard block) so the Catalog block owns the
// field registration, following the Annotate pattern where per-annotation
// fields are declared on the parent block.

import * as state from '@/lib/state';
import type { RuntimeProps, IdPrefix } from '@/lib/types';
import { extendIdPrefix, scopeMarker, asIdPrefix } from '@/lib/types/id-grammar';

// ---------------------------------------------------------------------------
// Fields — component-scoped (default), so each Catalog / repo card instance
// gets independent state keyed by its Redux key.
// ---------------------------------------------------------------------------

/** Catalog-level fields: filter/sort state + sidebar, scoped to each Catalog instance. */
export const catalogFields = state.fields(['catalogScope', 'catalogQuery', 'catalogSort', 'sidebarCollapsed']);

/** Per-repo-card fields: expand/collapse, scoped per repo via idPrefix. */
export const repoCardFields = state.fields(['expanded', 'showBlocks']);

// ---------------------------------------------------------------------------
// Origin ↔ scope-marker encoding
//
// scopeMarker() requires [0-9a-zA-Z_]+. Repo origins contain colons,
// slashes, dots, etc. We encode every non-alphanumeric character as _XX
// (two hex digits). The underscore itself encodes as _5f, keeping the
// encoding unambiguous and fully reversible.
// ---------------------------------------------------------------------------

/** Encode a repo origin string into a valid scope marker segment. */
export function encodeOriginForId(origin: string): string {
  return origin.replace(/[^a-zA-Z0-9]/g, c =>
    '_' + c.charCodeAt(0).toString(16).padStart(2, '0')
  );
}

/** Decode an encoded scope marker back to the original origin string. */
export function decodeOriginFromId(encoded: string): string {
  return encoded.replace(/_([0-9a-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

// ---------------------------------------------------------------------------
// Scoped props — Annotate pattern
//
// For origin "file:content" on block "catalog", the Redux key becomes
// "catalog:#file_3acontent" — and fields like `expanded` store under
// "catalog:#file_3acontent:expanded".
// ---------------------------------------------------------------------------

/** Build scoped RuntimeProps for a repo card, keyed by encoded origin. */
export function scopedRepoProps(props: RuntimeProps, origin: string): RuntimeProps {
  const encoded = encodeOriginForId(origin);
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(encoded)]);
  return { ...props, idPrefix, runtime: { ...props.runtime, idPrefix } };
}

// ---------------------------------------------------------------------------
// OLX IDs — canonical block IDs from content/system/catalog.olx
//
// The catalog OLX is:  <Catalog id="catalog"><RepoCard id="repo"/></Catalog>
// These constants must match those IDs.
// ---------------------------------------------------------------------------

/** Block ID of the Catalog instance in system OLX. */
export const CATALOG_ID = 'catalog';

/** Block ID of the RepoCard template in system OLX. */
export const REPO_ID = 'repo';

// ---------------------------------------------------------------------------
// Repo detail page helpers
//
// The /repo/:origin page renders the same RepoCard block from catalog.olx
// but with an idPrefix that matches the scoped state key the Catalog would
// create. This means expand/collapse state is shared between the catalog
// listing and the detail page.
//
// State key structure:  system/catalog:#[encodedOrigin]:repo
// idPrefix for RenderOLX:  catalog:#[encodedOrigin]
// ---------------------------------------------------------------------------

/**
 * Build the idPrefix for rendering a RepoCard at the /repo/:origin page.
 *
 * The rendered block's state key will be:
 *   system/catalog:#[encodedOrigin]:repo
 * matching what the Catalog creates for each repo card.
 */
export function repoIdPrefix(origin: string): IdPrefix {
  const encoded = encodeOriginForId(origin);
  return asIdPrefix(`${CATALOG_ID}:${scopeMarker(encoded)}`);
}

/** Extract the repo origin from an idPrefix built by repoIdPrefix/scopedRepoProps.
 *  Returns null if the prefix doesn't contain a scope marker. */
export function originFromIdPrefix(idPrefix: string): string | null {
  const match = idPrefix.match(/#([^:]+)/);
  if (!match) return null;
  return decodeOriginFromId(match[1]);
}
