// packages/shared/lib/state/catalog.ts
//
// Catalog data in Redux — repositories and their launchables, loaded from
// the get_repositories MCP tool and stored here for the whole app to read.
// Follows the chat pattern: dispatch via lo_event.logEvent() (no block props),
// reducer inline in updateResponseReducer (store.ts).
//
// The transport is MCP (callMcpTool); the state is Redux. Wire validation
// uses the shared Zod schema (catalog/schema.ts).
//
'use client';

import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';
import { callMcpTool } from '@/lib/mcp/client';
import { GetRepositoriesOutput, type Repository } from '@/lib/catalog/schema';

// =============================================================================
// Types
// =============================================================================

export type CatalogLoadingStatus = 'ready' | 'loading' | 'error';

export interface CatalogEntry {
  repositories: Repository[];
  loadingState: { status: CatalogLoadingStatus };
  error?: { message: string };
}

export interface CatalogState {
  [argsKey: string]: CatalogEntry;
}

// Full Redux state shape (for selector typing)
interface RootState {
  application_state?: {
    catalog?: CatalogState;
    [key: string]: any;
  };
}

// =============================================================================
// Event Types
// =============================================================================

export const CATALOG_LOADING = 'CATALOG_LOADING';
export const CATALOG_LOADED = 'CATALOG_LOADED';
export const CATALOG_ERROR = 'CATALOG_ERROR';

export const CATALOG_EVENT_TYPES = [CATALOG_LOADING, CATALOG_LOADED, CATALOG_ERROR];

// =============================================================================
// Initial State
// =============================================================================

export const initialCatalogState: CatalogState = {};

// =============================================================================
// Dispatch Helpers (via lo_event.logEvent, like chat)
// =============================================================================

export function dispatchCatalogLoading(argsKey: string): void {
  lo_event.logEvent(CATALOG_LOADING, { argsKey });
}

export function dispatchCatalogLoaded(argsKey: string, repositories: Repository[]): void {
  lo_event.logEvent(CATALOG_LOADED, { argsKey, repositories });
}

export function dispatchCatalogError(argsKey: string, error: string): void {
  lo_event.logEvent(CATALOG_ERROR, { argsKey, error: { message: error } });
}

// =============================================================================
// Fetch + Dedup (matches ensuredIds pattern in useOlxJson.ts)
// =============================================================================

const fetchedKeys = new Set<string>();

function fetchCatalog(args: Record<string, unknown>, argsKey: string): void {
  fetchedKeys.add(argsKey);
  dispatchCatalogLoading(argsKey);

  callMcpTool<unknown>('get_repositories', args)
    .then((raw) => {
      const parsed = GetRepositoriesOutput.parse(raw);
      dispatchCatalogLoaded(argsKey, parsed.repositories);
    })
    .catch((err) => {
      fetchedKeys.delete(argsKey);  // allow retry on network failure
      dispatchCatalogError(argsKey, err instanceof Error ? err.message : String(err));
    });
}

/**
 * Ensure catalog data is loaded for the given args. Deduped: a second call
 * with the same args is a no-op. On network error the key is removed so the
 * next call retries; on API/parse error it stays to prevent retry storms.
 */
export function ensureCatalog(args: Record<string, unknown> = {}): void {
  const argsKey = JSON.stringify(args);
  if (fetchedKeys.has(argsKey)) return;
  fetchCatalog(args, argsKey);
}

/**
 * HACK: Force a re-fetch of catalog data, bypassing the dedup guard.
 *
 * Called when navigating to /catalog so edits made in Studio are visible
 * without a hard reload. This is a stopgap — the right fix is server→client
 * push via MCP notifications (the SSE stream the transport already holds).
 * When the tool advertises list-changed, the client subscribes and refetches
 * automatically; this function and every call site go away.
 *
 * TODO: Replace with MCP notification subscription (see client.ts TODO).
 */
export function refreshCatalog(args: Record<string, unknown> = {}): void {
  const argsKey = JSON.stringify(args);
  fetchedKeys.delete(argsKey);
  fetchCatalog(args, argsKey);
}

// =============================================================================
// Selectors
// =============================================================================

export function selectCatalogEntry(state: RootState, argsKey: string): CatalogEntry | undefined {
  return state.application_state?.catalog?.[argsKey];
}

export function selectCatalogRepositories(state: RootState, argsKey: string): Repository[] {
  const entry = selectCatalogEntry(state, argsKey);
  return entry?.loadingState.status === 'ready' ? entry.repositories : [];
}

// =============================================================================
// React Hook
// =============================================================================

/** Read catalog entry from Redux. Pair with ensureCatalog() to trigger the fetch. */
export function useCatalogData(argsKey: string): CatalogEntry | undefined {
  return useSelector((state: RootState) => selectCatalogEntry(state, argsKey));
}

/** Find a repository by its origin across all loaded catalog entries. */
export function useRepoByOrigin(origin: string): Repository | undefined {
  return useSelector((state: RootState) => {
    const catalog = state.application_state?.catalog;
    if (!catalog) return undefined;
    for (const entry of Object.values(catalog)) {
      const match = entry.repositories.find(r => r.origin === origin);
      if (match) return match;
    }
    return undefined;
  });
}
