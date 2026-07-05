// packages/shared/lib/state/docs.ts
//
// Documentation cache in Redux — get_blocks / get_formats MCP results,
// normalized by (kind × name × facet) so overlapping queries share data:
//
//   records[kind][name]          merged record — facets accumulate as they
//                                arrive (flat wire shape makes merge = spread)
//   have[kind][name]             per-facet status ('loading' | 'ready')
//   listings[kind][listingKey]   what a query ('*', categories, …) resolved
//                                to: an ordered name list + status
//
// The descriptor (name/description/categories/source/…) is an implicit
// facet ('descriptor') present on every response. Fetch dedup lives in the
// have/listing status marks — no module-level Set bookkeeping. The
// component-facing API is useDocs/useFormats (lib/docs/useDocs.ts); this
// module owns state shape, events, and the fetch.
//
// NOTE for state/catalog.ts: the catalog slice is the older query-keyed
// twin of the previous docs slice. This normalized shape is the
// createContentSlice design candidate — catalog migrates onto it once this
// has soaked (see backlog).

'use client';

import * as lo_event from 'lo_event';
import { callMcpTool } from '@/lib/mcp/client';
import { GetBlocksOutput, GetFormatsOutput } from '@/lib/docs/schema';
import type { RootState, DocsState, DocsKind, DocsFacetStatus } from '../types';

// =============================================================================
// Event Types (already registered in store.ts collectEventTypes — reused,
// with the normalized payloads, so no logger wiring changes)
// =============================================================================

export const DOCS_LOADING = 'DOCS_LOADING';
export const DOCS_LOADED = 'DOCS_LOADED';
export const DOCS_ERROR = 'DOCS_ERROR';

export const DOCS_EVENT_TYPES = [DOCS_LOADING, DOCS_LOADED, DOCS_ERROR];

/** The implicit facet every response carries. */
export const DESCRIPTOR = 'descriptor';

export const initialDocsState: DocsState = {
  block: { records: {}, have: {}, listings: {} },
  format: { records: {}, have: {}, listings: {} },
};

// =============================================================================
// Reducer (delegated from updateResponseReducer)
// =============================================================================

function markFacets(
  have: Record<string, Record<string, DocsFacetStatus>>,
  names: string[],
  facets: string[],
  status: DocsFacetStatus,
): Record<string, Record<string, DocsFacetStatus>> {
  const next = { ...have };
  for (const name of names) {
    const entry = { ...(next[name] ?? {}) };
    for (const facet of facets) {
      // Never regress 'ready' — a later broader query's loading/error marks
      // must not hide data we already hold.
      if (entry[facet] === 'ready' && status !== 'ready') continue;
      entry[facet] = status;
    }
    next[name] = entry;
  }
  return next;
}

export function docsReducer(state: DocsState = initialDocsState, action: any): DocsState {
  const kind: DocsKind = action.kind;
  if (action.type !== DOCS_LOADING && action.type !== DOCS_LOADED && action.type !== DOCS_ERROR) {
    return state;
  }
  const store = state[kind];
  if (!store) return state;
  const facets: string[] = action.facets ?? [];

  switch (action.type) {
    case DOCS_LOADING: {
      const names: string[] = action.names ?? [];
      return {
        ...state,
        [kind]: {
          ...store,
          have: markFacets(store.have, names, [DESCRIPTOR, ...facets], 'loading'),
          listings: action.listingKey
            ? { ...store.listings, [action.listingKey]: { names: store.listings[action.listingKey]?.names ?? null, status: 'loading' } }
            : store.listings,
        },
      };
    }
    case DOCS_LOADED: {
      const records: Array<{ name: string }> = action.records ?? [];
      const names = records.map(r => r.name);
      const merged = { ...store.records };
      for (const record of records) {
        merged[record.name] = { ...merged[record.name], ...record };
      }
      return {
        ...state,
        [kind]: {
          records: merged,
          have: markFacets(store.have, names, [DESCRIPTOR, ...facets], 'ready'),
          listings: action.listingKey
            ? { ...store.listings, [action.listingKey]: { names, status: 'ready' } }
            : store.listings,
        },
      };
    }
    case DOCS_ERROR: {
      const names: string[] = action.names ?? [];
      return {
        ...state,
        [kind]: {
          ...store,
          // 'error' (not cleared): surfaced to callers, and keeps the hook
          // from refetch-looping a persistently failing key. Retry = reload.
          have: markFacets(store.have, names, [DESCRIPTOR, ...facets], 'error'),
          listings: action.listingKey
            ? { ...store.listings, [action.listingKey]: { names: store.listings[action.listingKey]?.names ?? null, status: 'error', error: action.error } }
            : store.listings,
        },
      };
    }
    default:
      return state;
  }
}

// =============================================================================
// Fetch — one function per query shape; dedup is the caller's job (useDocs
// consults have/listings before calling)
// =============================================================================

const TOOL = { block: 'get_blocks', format: 'get_formats' } as const;
const OUTPUT = { block: GetBlocksOutput, format: GetFormatsOutput } as const;
const RECORDS_KEY = { block: 'blocks', format: 'formats' } as const;

/**
 * Fetch records for a kind. Exactly one of:
 *   names      — known targets (facet top-up; no listing bookkeeping)
 *   listingKey + filter — a query to resolve (names recorded under the key)
 */
export function fetchDocs(kind: DocsKind, opts: {
  names?: string[];
  listingKey?: string;
  filter?: string[];
  facets: string[];
}): void {
  const { names, listingKey, filter, facets } = opts;
  lo_event.logEvent(DOCS_LOADING, { kind, names: names ?? [], facets, listingKey });

  const args: Record<string, unknown> = {
    ...(names ? { filter: names } : filter?.length ? { filter } : {}),
    ...(facets.length ? { include: facets } : {}),
  };

  callMcpTool<unknown>(TOOL[kind], args, { retry: true })
    .then((raw) => {
      const parsed = OUTPUT[kind].parse(raw) as Record<string, unknown>;
      lo_event.logEvent(DOCS_LOADED, {
        kind,
        records: parsed[RECORDS_KEY[kind]],
        facets,
        listingKey,
      });
    })
    .catch((err) => {
      console.error(`Docs fetch failed (${TOOL[kind]}):`, err);
      lo_event.logEvent(DOCS_ERROR, {
        kind,
        names: names ?? [],
        facets,
        listingKey,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    });
}

// =============================================================================
// Selectors
// =============================================================================

export function selectDocsStore(state: RootState, kind: DocsKind) {
  return state.application_state?.docs?.[kind];
}
