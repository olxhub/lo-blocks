// packages/shared/components/blocks/navigation/Catalog/locals.ts
//
// Shared helpers for the Catalog/RepoCard block family.
//
// Exports:
//   repoCardFields    — component-scoped fields for per-repo-card state
//   encodeOriginForId — encode a repo origin into a valid scope marker
//   scopedRepoProps   — build RuntimeProps scoped to a specific repo
//
// CatalogView, SearchResults, and RepoDetailPage all import from here to
// create scoped props for RepoCard instances. The field declarations live
// here (not on a separate RepoCard block) so the Catalog block owns the
// field registration, following the Annotate pattern where per-annotation
// fields are declared on the parent block.

import * as state from '@/lib/state';
import type { RuntimeProps, IdPrefix, Launchable } from '@/lib/types';
import { extendIdPrefix, scopeMarker, asIdPrefix, asDefinitionKey } from '@/lib/types/id-grammar';
import type { ScenarioGroup } from './group';

// ---------------------------------------------------------------------------
// Fields — component-scoped (default), so each Catalog / repo card instance
// gets independent state keyed by its Redux key.
// ---------------------------------------------------------------------------

/** Catalog-level fields: filter/sort state + sidebar, scoped to each Catalog instance. */
export const catalogFields = state.fields(['catalogScope', 'catalogQuery', 'catalogSort', 'sidebarCollapsed']);

/** Per-repo-card fields: expand/collapse, scoped per repo via idPrefix. */
export const repoCardFields = state.fields(['expanded', 'showBlocks']);

// ---------------------------------------------------------------------------
// OLX IDs — canonical block IDs for the catalog system
//
// These constants ARE the canonical IDs (there is no content/system/catalog.olx
// file). CatalogPage and RepoDetailPage each build their inline OLX
// (<Catalog id={CATALOG_ID}><RepoCard id={REPO_ID}/></Catalog>) from them, so
// the two pages agree on the same block IDs.
// ---------------------------------------------------------------------------

/** Block ID of the Catalog instance in system OLX. */
export const CATALOG_ID = 'catalog';

/** Block ID of the RepoCard template in system OLX. */
export const REPO_ID = 'repo';

// ---------------------------------------------------------------------------
// Origin → scope-marker encoding
//
// scopeMarker() requires [0-9a-zA-Z_]+. Repo origins contain colons,
// slashes, dots, etc. We encode every non-alphanumeric character as _XX_
// (hex code point, terminated by a closing underscore). The trailing
// underscore is load-bearing: without it, a code point above U+00FF (3+ hex
// digits) can run into the literal alphanumeric characters that follow it,
// so two different origins could encode to the same scope marker and
// silently share state. The underscore itself encodes as _5f_, so the only
// underscores in the output are escape delimiters.
// ---------------------------------------------------------------------------

/** Encode a repo origin string into a valid scope marker segment. One-way
 *  (no decoder): the encoded value is used only as an opaque Redux scope
 *  key, never decoded back to an origin — RepoCard reads origin from a
 *  separate OLX attribute or React prop. */
export function encodeOriginForId(origin: string): string {
  return origin.replace(/[^a-zA-Z0-9]/g, c =>
    `_${c.charCodeAt(0).toString(16)}_`
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
// "system/catalog:#file_3a_content:repo". Fields like `expanded` are
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
// The /repo/:origin page renders a standalone RepoCard block (built from
// REPO_ID, same as the Catalog's inline OLX) with an idPrefix that matches
// the scoped state key the Catalog would create. This means expand/collapse
// state is shared between the catalog listing and the detail page.
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

// ---------------------------------------------------------------------------
// Compact item list — pure data transform for compact card rendering
// ---------------------------------------------------------------------------

export type CompactItem =
  | { kind: 'heading'; label: string; course?: Launchable }
  | { kind: 'activity'; launchable: Launchable };

/** Collect a flat ordered list of headings + activities across all scenario
 *  groups for compact title rendering, preserving group structure. */
export function compactItems(groups: ScenarioGroup[], isFlat: boolean): CompactItem[] {
  const out: CompactItem[] = [];
  for (const g of groups) {
    // For flat repos (single namespace, no Course) skip the heading.
    if (!isFlat) {
      if (g.course) {
        out.push({ kind: 'heading', label: g.course.title, course: g.course });
      } else {
        out.push({ kind: 'heading', label: scenarioLabel(g.namespace) });
      }
    }
    for (const a of g.activities) {
      out.push({ kind: 'activity', launchable: a });
    }
  }
  return out;
}
