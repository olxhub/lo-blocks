// packages/shared/lib/state/sources.ts
//
// Content sources in Redux — the authoring-facing source list (Studio's
// repo picker), loaded from the get_sources MCP tool and cached here.
// Catalog's little sibling: same MCP tool → redux cache → hook shape, so
// pages react to changes, and MCP push can later refresh it server-side.
//
// One global list, no args — simpler than catalog's per-argsKey entries.

'use client';

import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';
import { callMcpTool } from '@/lib/mcp/client';
import { toLofsOrigin } from '@/lib/types/address';
import type { RootState, SourcesState, SourceOption } from '../types';

// =============================================================================
// Event Types
// =============================================================================

export const SOURCES_LOADING = 'SOURCES_LOADING';
export const SOURCES_LOADED = 'SOURCES_LOADED';
export const SOURCES_ERROR = 'SOURCES_ERROR';

export const SOURCES_EVENT_TYPES = [SOURCES_LOADING, SOURCES_LOADED, SOURCES_ERROR];

// =============================================================================
// Initial State + Reducer (delegated from updateResponseReducer)
// =============================================================================

export const initialSourcesState: SourcesState = {
  sources: [],
  loadingState: { status: 'loading' },
};

export function sourcesReducer(
  state: SourcesState = initialSourcesState,
  action: any,
): SourcesState {
  switch (action.type) {
    case SOURCES_LOADING:
      return { ...state, loadingState: { status: 'loading' } };
    case SOURCES_LOADED:
      return { sources: action.sources, loadingState: { status: 'ready' } };
    case SOURCES_ERROR:
      return { ...state, loadingState: { status: 'error' }, error: action.error };
    default:
      return state;
  }
}

// =============================================================================
// Fetch + Dedup (matches catalog.ts)
// =============================================================================

let fetched = false;
let fetching = false;

function fetchSources(): void {
  fetching = true;
  lo_event.logEvent(SOURCES_LOADING, {});

  callMcpTool<{ sources: Array<{ origin: string; label: string; writable: boolean }> }>(
    'get_sources', {}, { retry: true })
    .then(({ sources }) => {
      fetching = false;
      fetched = true;
      // JSON drops the LofsOrigin brand — re-brand at the boundary.
      const branded: SourceOption[] = sources.map(s => ({ ...s, origin: toLofsOrigin(s.origin) }));
      lo_event.logEvent(SOURCES_LOADED, { sources: branded });
    })
    .catch((err) => {
      console.error('Sources fetch failed:', err);
      fetching = false;
      fetched = false;  // allow retry on next call
      lo_event.logEvent(SOURCES_ERROR, { error: { message: err instanceof Error ? err.message : String(err) } });
    });
}

/** Ensure the source list is loaded. Deduped: no-op when a fetch already
 *  completed or is in flight; an error clears the guard so the next call
 *  retries. */
export function ensureSources(): void {
  if (fetched || fetching) return;
  fetchSources();
}

/** Force a re-fetch (explicit user refresh). Routine mounts use the hook.
 *  TODO: replace with MCP notification subscription (see mcp/client.ts). */
export function refreshSources(): void {
  fetching = false;
  fetched = false;
  fetchSources();
}

// =============================================================================
// React Hook
// =============================================================================

/** The configured content sources, fetching on first use. Writable sources
 *  come first (the server's picker ordering). */
export function useSources(): SourcesState {
  useEffect(() => { ensureSources(); }, []);
  return useSelector((state: RootState) =>
    state.application_state?.sources ?? initialSourcesState);
}
