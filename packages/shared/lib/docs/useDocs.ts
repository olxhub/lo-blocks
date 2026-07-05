'use client';
// packages/shared/lib/docs/useDocs.ts
//
// Component-facing documentation API: specify what you need, get what's
// cached plus a loading flag while the rest arrives.
//
//   const { blocks, loading } = useDocs(['CapaProblem'], ['attributes']);
//   const { blocks, loading } = useDocs('*');                    // listing
//   const { blocks }          = useDocs({ categories: ['Input'] });
//   const { formats }         = useFormats(['chat'], ['spec']);
//
// Selectors:
//   string[]  exact block names — no listing round-trip; per-name facet
//             coverage against the cache
//   '*'       everything (all non-internal) — the degenerate listing
//   object    listing query; keys are additive so new capabilities
//             (search, globs, …) extend it without breaking callers:
//               { blocks?, categories?, match?, internal? }
//             `match` is raw OR-match (names or categories — MCP filter
//             semantics), for callers that don't know which they hold.
//
// Facets are the MCP include names ('attributes', 'fields', 'readme',
// 'examples', 'spec', …). Omit for descriptor-only (name, description,
// categories, source, …).
//
// The Redux docs slice (state/docs.ts) is the cache, normalized by
// (kind × name × facet); this hook computes the missing delta and fetches
// only that. Dedup lives in the slice's status marks, plus a small
// module-level in-flight guard for the window before a dispatch lands.

import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  fetchDocs, selectDocsStore, DESCRIPTOR,
} from '@/lib/state/docs';
import type {
  RootState, DocsKind, DocsKindStore, BlockDocRecord, FormatDocRecord,
} from '@/lib/types';

export type DocsSelector =
  | '*'
  | string[]
  | { blocks?: string[]; categories?: string[]; match?: string[]; internal?: boolean };

interface UseDocsKindResult<Record> {
  records: Record[];
  loading: boolean;
  error: string | null;
}

/** Guard for the dispatch-latency window: keys requested this session that
 *  may not yet be reflected in Redux. Cleared implicitly — once the slice
 *  marks them, the slice is authoritative and these are never re-added. */
const requested = new Set<string>();

/** Canonical (selector → listing) normalization. Arrays are NOT listings —
 *  they resolve directly against per-name coverage. */
function normalizeSelector(selector: DocsSelector): {
  names: string[] | null;          // known upfront (array form)
  listingKey: string | null;       // cache key for query forms
  filter: string[] | undefined;    // MCP filter for query forms
} {
  if (Array.isArray(selector)) {
    return { names: selector, listingKey: null, filter: undefined };
  }
  const query = selector === '*' ? {} : selector;
  const filter = [
    ...(query.blocks ?? []),
    ...(query.categories ?? []),
    ...(query.match ?? []),
  ];
  // Key on the normalized query object so equivalent queries share a listing.
  const listingKey = JSON.stringify({ filter: [...filter].sort(), internal: query.internal ?? false });
  return { names: null, listingKey, filter: filter.length ? filter : undefined };
}

function useDocsKind<Record extends { name: string }>(
  kind: DocsKind,
  selector: DocsSelector,
  facets: string[],
): UseDocsKindResult<Record> {
  // The kind discriminates the record type (block → BlockDocRecord,
  // format → FormatDocRecord); the generic re-associates them for callers.
  const store = useSelector(
    (state: RootState) => selectDocsStore(state, kind),
  ) as unknown as DocsKindStore<Record> | undefined;

  const { names: selectorNames, listingKey, filter } = normalizeSelector(selector);
  const listing = listingKey ? store?.listings[listingKey] : undefined;

  // Names this request covers: the array form, or whatever the listing
  // resolved to (null until it loads).
  const names = selectorNames ?? listing?.names ?? null;

  // Delta: names whose requested facets (descriptor included) aren't
  // cached, in flight, or failed ('error' is terminal — no refetch loop).
  const missing = (names ?? []).filter(name => {
    const status = store?.have[name];
    return [DESCRIPTOR, ...facets].some(f => !status?.[f]);
  });

  const needsListing = !!listingKey && !listing;
  const facetsKey = facets.join(',');
  const missingKey = missing.join(',');

  useEffect(() => {
    if (needsListing) {
      const guard = `${kind}:listing:${listingKey}:${facetsKey}`;
      if (!requested.has(guard)) {
        requested.add(guard);
        fetchDocs(kind, { listingKey: listingKey!, filter, facets });
      }
      return;
    }
    if (missing.length) {
      const guard = `${kind}:names:${missingKey}:${facetsKey}`;
      if (!requested.has(guard)) {
        requested.add(guard);
        fetchDocs(kind, { names: missing, facets });
      }
    }
    // filter/missing are derived from the serialized keys below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, needsListing, listingKey, missingKey, facetsKey]);

  const records = (names ?? [])
    .map(name => store?.records[name])
    .filter((r): r is Record => !!r);

  const statuses = (names ?? []).flatMap(name =>
    [DESCRIPTOR, ...facets].map(f => store?.have[name]?.[f]));
  const pending =
    (listingKey ? !listing || listing.status === 'loading' : false) ||
    statuses.some(s => s !== 'ready' && s !== 'error');

  const facetError = statuses.includes('error')
    ? 'Some documentation failed to load — reload to retry.'
    : null;

  return {
    records,
    loading: pending,
    error: listing?.status === 'error'
      ? (listing.error?.message ?? 'Unknown error')
      : facetError,
  };
}

/** Block documentation. See module header for selector and facet forms. */
export function useDocs(selector: DocsSelector = '*', facets: string[] = []) {
  const { records, loading, error } = useDocsKind<BlockDocRecord>('block', selector, facets);
  return { blocks: records, loading, error };
}

/** Content-format (grammar) documentation — same contract as useDocs. */
export function useFormats(selector: DocsSelector = '*', facets: string[] = []) {
  const { records, loading, error } = useDocsKind<FormatDocRecord>('format', selector, facets);
  return { formats: records, loading, error };
}
