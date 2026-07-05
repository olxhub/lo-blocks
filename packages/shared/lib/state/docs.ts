// packages/shared/lib/state/docs.ts
//
// Block documentation data in Redux — get_blocks MCP results, stored here
// for docs blocks (BlockIndex, BlockDoc) to read. The transport is MCP
// (callMcpTool); the state is Redux; wire validation uses the shared Zod
// schema (docs/tools.ts).
//
// DELIBERATE TWIN of state/catalog.ts, hack and all: catalog.ts carries a
// fenced HACK note (module-level dedup Sets, argsKey = JSON.stringify,
// dispatch via bare lo_event) pending the planned createContentSlice
// convergence for semi-static content. This file copies that pattern
// EXACTLY rather than improvising a third dialect — when the convergence
// lands, it migrates two identical twins in one motion. Do not let the
// twins drift; fix both or neither.

'use client';

import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';
import { callMcpTool } from '@/lib/mcp/client';
import {
  GetBlocksOutput, GetFormatsOutput,
  type BlockDocInfo, type FormatDocInfo,
} from '@/lib/docs/schema';
import type { RootState, DocsEntry, DocsState } from '../types';

// =============================================================================
// Event Types
// =============================================================================

export const DOCS_LOADING = 'DOCS_LOADING';
export const DOCS_LOADED = 'DOCS_LOADED';
export const DOCS_ERROR = 'DOCS_ERROR';

export const DOCS_EVENT_TYPES = [DOCS_LOADING, DOCS_LOADED, DOCS_ERROR];

// =============================================================================
// Initial State
// =============================================================================

export const initialDocsState: DocsState = {};

// =============================================================================
// Reducer (delegated from updateResponseReducer, like catalogReducer)
// =============================================================================

export function docsReducer(
  state: DocsState = initialDocsState,
  action: any,
): DocsState {
  const { argsKey } = action;
  switch (action.type) {
    case DOCS_LOADING:
      return {
        ...state,
        [argsKey]: {
          blocks: state[argsKey]?.blocks ?? [],
          formats: state[argsKey]?.formats ?? [],
          loadingState: { status: 'loading' },
        },
      };
    case DOCS_LOADED:
      return {
        ...state,
        [argsKey]: {
          blocks: action.blocks ?? [],
          formats: action.formats ?? [],
          loadingState: { status: 'ready' },
        },
      };
    case DOCS_ERROR:
      return {
        ...state,
        [argsKey]: {
          blocks: state[argsKey]?.blocks ?? [],
          formats: state[argsKey]?.formats ?? [],
          loadingState: { status: 'error' },
          error: action.error,
        },
      };
    default:
      return state;
  }
}

// =============================================================================
// Dispatch Helpers (via lo_event.logEvent, like catalog)
// =============================================================================

export function dispatchDocsLoading(argsKey: string): void {
  lo_event.logEvent(DOCS_LOADING, { argsKey });
}

export function dispatchDocsLoaded(argsKey: string, blocks: BlockDocInfo[]): void {
  lo_event.logEvent(DOCS_LOADED, { argsKey, blocks });
}

export function dispatchFormatsLoaded(argsKey: string, formats: FormatDocInfo[]): void {
  lo_event.logEvent(DOCS_LOADED, { argsKey, formats });
}

export function dispatchDocsError(argsKey: string, error: string): void {
  lo_event.logEvent(DOCS_ERROR, { argsKey, error: { message: error } });
}

// =============================================================================
// Fetch + Dedup (matches ensuredIds pattern in useOlxJson.ts)
// =============================================================================

/** Keys whose fetch completed successfully — dedup guard for ensureDocs. */
const fetchedKeys = new Set<string>();
/** Keys with a fetch currently in-flight — prevents duplicate concurrent requests. */
const fetchingKeys = new Set<string>();

function fetchDocs(args: Record<string, unknown>, argsKey: string): void {
  fetchingKeys.add(argsKey);
  dispatchDocsLoading(argsKey);

  callMcpTool<unknown>('get_blocks', args, { retry: true })
    .then((raw) => {
      const parsed = GetBlocksOutput.parse(raw);
      fetchingKeys.delete(argsKey);
      fetchedKeys.add(argsKey);
      dispatchDocsLoaded(argsKey, parsed.blocks);
    })
    .catch((err) => {
      console.error('Docs fetch failed:', err);
      fetchingKeys.delete(argsKey);
      fetchedKeys.delete(argsKey);  // allow retry on next call
      dispatchDocsError(argsKey, err instanceof Error ? err.message : String(err));
    });
}

/**
 * Ensure block documentation is loaded for the given get_blocks args.
 * Deduped: a second call with the same args is a no-op if a fetch already
 * completed or is in-flight. On error both guards are cleared so the next
 * call retries.
 */
export function ensureDocs(args: Record<string, unknown> = {}): void {
  const argsKey = JSON.stringify(args);
  if (fetchedKeys.has(argsKey) || fetchingKeys.has(argsKey)) return;
  fetchDocs(args, argsKey);
}

/** Force a re-fetch, bypassing the dedup guard. Use sparingly — see
 *  refreshCatalog's note; the long-term fix is MCP push. */
export function refreshDocs(args: Record<string, unknown> = {}): void {
  const argsKey = JSON.stringify(args);
  fetchingKeys.delete(argsKey);
  fetchedKeys.delete(argsKey);
  fetchDocs(args, argsKey);
}

// -----------------------------------------------------------------------------
// Formats (get_formats) — same slice, same events, keys prefixed `formats:`
// so a get_formats query can never collide with a get_blocks query.
// -----------------------------------------------------------------------------

function fetchFormats(args: Record<string, unknown>, argsKey: string): void {
  fetchingKeys.add(argsKey);
  dispatchDocsLoading(argsKey);

  callMcpTool<unknown>('get_formats', args, { retry: true })
    .then((raw) => {
      const parsed = GetFormatsOutput.parse(raw);
      fetchingKeys.delete(argsKey);
      fetchedKeys.add(argsKey);
      dispatchFormatsLoaded(argsKey, parsed.formats);
    })
    .catch((err) => {
      console.error('Formats fetch failed:', err);
      fetchingKeys.delete(argsKey);
      fetchedKeys.delete(argsKey);  // allow retry on next call
      dispatchDocsError(argsKey, err instanceof Error ? err.message : String(err));
    });
}

/** Key for a get_formats query in the docs slice. Exported so hooks and
 *  selectors compute the identical key. */
export function formatsArgsKey(args: Record<string, unknown> = {}): string {
  return `formats:${JSON.stringify(args)}`;
}

/** Ensure content-format documentation is loaded for the given get_formats
 *  args. Dedup semantics identical to ensureDocs. */
export function ensureFormats(args: Record<string, unknown> = {}): void {
  const argsKey = formatsArgsKey(args);
  if (fetchedKeys.has(argsKey) || fetchingKeys.has(argsKey)) return;
  fetchFormats(args, argsKey);
}

// =============================================================================
// Selectors
// =============================================================================

export function selectDocsEntry(state: RootState, argsKey: string): DocsEntry | undefined {
  return state.application_state?.docs?.[argsKey];
}

// =============================================================================
// React Hook
// =============================================================================

/** Read a docs entry from Redux. Pair with ensureDocs() to trigger the fetch. */
export function useDocsData(argsKey: string): DocsEntry | undefined {
  return useSelector((state: RootState) => selectDocsEntry(state, argsKey));
}
