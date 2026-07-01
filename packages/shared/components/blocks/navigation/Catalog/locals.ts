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
// CatalogView, SearchResults, and RepoDetailPage all import from here to
// create scoped props for RepoCard instances. The field declarations live
// here (not on a separate RepoCard block) so the Catalog block owns the
// field registration, following the Annotate pattern where per-annotation
// fields are declared on the parent block.

import * as state from '@/lib/state';
import type { RuntimeProps, IdPrefix } from '@/lib/types';
import { extendIdPrefix, scopeMarker, asIdPrefix, asDefinitionKey } from '@/lib/types/id-grammar';
import type { ScenarioGroup as Group } from '@/lib/catalog/group';

// ---------------------------------------------------------------------------
// Fields — component-scoped (default), so each Catalog / repo card instance
// gets independent state keyed by its Redux key.
// ---------------------------------------------------------------------------

/** Catalog-level fields: filter/sort state + sidebar, scoped to each Catalog instance. */
export const catalogFields = state.fields(['catalogScope', 'catalogQuery', 'catalogSort', 'sidebarCollapsed']);

/** Per-repo-card fields: expand/collapse, scoped per repo via idPrefix. */
export const repoCardFields = state.fields(['expanded', 'showBlocks']);

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
// Shared helpers
// ---------------------------------------------------------------------------

/** Readable label for a scenario with no Course — last namespace segment,
 *  title-cased ("…psych.defiance" → "Defiance"). */
export function scenarioLabel(namespace: string): string {
  const leaf = namespace.slice(namespace.lastIndexOf('.') + 1);
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}

// ---------------------------------------------------------------------------
// Scoped props — Annotate pattern
//
// For origin "file:content", the block state key becomes
// "system/catalog:#file_3acontent:repo". Fields like `expanded` are
// stored as properties under that key in Redux.
//
// Both the catalog listing and the /repo/:origin detail page produce the
// same state key, so expand/collapse state is shared.
// ---------------------------------------------------------------------------

/** Build scoped RuntimeProps for a repo card, keyed by encoded origin.
 *
 *  Sets id to REPO_ID so the state key matches the /repo/:origin page:
 *    system/catalog:#[encodedOrigin]:repo
 *  Without this, the catalog path would use the parent Catalog block's id
 *  ("catalog"), producing a different key than the detail page. */
export function scopedRepoProps(props: RuntimeProps, origin: string): RuntimeProps {
  const encoded = encodeOriginForId(origin);
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(encoded)]);
  return { ...props, id: asDefinitionKey(REPO_ID), idPrefix, runtime: { ...props.runtime, idPrefix } };
}

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

// ---------------------------------------------------------------------------
// Compact item list — pure data transform for compact card rendering
// ---------------------------------------------------------------------------

export type CompactItem =
  | { kind: 'heading'; label: string; id?: string; path?: string; description?: string; status?: string }
  | { kind: 'activity'; title: string; id: string; path: string; description?: string; status?: string };

/** Collect a flat ordered list of headings + activities across all scenario
 *  groups for compact title rendering, preserving group structure. */
export function compactItems(groups: Group[], isFlat: boolean): CompactItem[] {
  const out: CompactItem[] = [];
  for (const g of groups) {
    // For flat repos (single namespace, no Course) skip the heading.
    if (!isFlat) {
      if (g.course) {
        out.push({ kind: 'heading', label: g.course.title, id: g.course.id, path: g.course.path, description: g.course.description, status: g.course.status });
      } else {
        out.push({ kind: 'heading', label: scenarioLabel(g.namespace) });
      }
    }
    for (const a of g.activities) {
      out.push({ kind: 'activity', title: a.title, id: a.id, path: a.path, description: a.description, status: a.status });
    }
  }
  return out;
}
