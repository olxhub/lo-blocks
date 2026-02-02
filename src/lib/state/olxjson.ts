// src/lib/state/olxjson.ts
//
// OLX JSON content state - Redux state for parsed OLX content.
//
// Manages the idMap content in Redux, enabling reactive block access.
// Content is namespaced by source (system, docs, studio) to support
// overlays where higher-priority sources override lower ones.
//
// NOTE: This is content (parsed OLX), not application state (user interactions).
// Currently lives at state.application_state.olxjson due to lo_event's state
// wrapping. See TODO in store.ts for future cleanup.
//
// Block authors don't interact with this directly - they use useKids/useBlock
// hooks which handle all the complexity internally.
//
'use client';

import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';
import { extractLocalizedVariant } from '@/lib/i18n/getBestLocale';
import type { OlxJson, OlxKey, IdMap } from '../types';
import type { LogEventFn } from '../render';

// =============================================================================
// Types
// =============================================================================

export type LoadingStatus = 'ready' | 'loading' | 'error';

export interface BlockEntry {
  olxJson: OlxJson | null;
  loadingState: { status: LoadingStatus };
  error?: { message: string };
}

export interface SourceState {
  [id: string]: BlockEntry;
}

export interface OlxJsonState {
  [source: string]: SourceState;
}

// Full Redux state shape (for selector typing)
// Note: olxjson lives inside application_state due to lo_event's state wrapping
interface RootState {
  application_state?: {
    olxjson?: OlxJsonState;
    [key: string]: any;
  };
}

// =============================================================================
// Event Types
// =============================================================================

export const LOAD_OLXJSON = 'LOAD_OLXJSON';
export const OLXJSON_LOADING = 'OLXJSON_LOADING';
export const OLXJSON_ERROR = 'OLXJSON_ERROR';
export const CLEAR_OLXJSON = 'CLEAR_OLXJSON';

// =============================================================================
// Dispatch Helpers
// =============================================================================

/**
 * Dispatch parsed OLX content to Redux via lo_event.
 *
 * Call this after content is loaded/parsed to populate the Redux store.
 * Content is namespaced by source - same block ID in different sources
 * is tracked separately, with higher-priority sources overriding lower ones
 * when accessed via selectors.
 *
 * @param props - Component props (must include logEvent)
 * @param source - Source identifier (e.g., 'content', 'inline', 'studio')
 * @param blocks - IdMap of parsed blocks: { [id]: OlxJson }
 *
 * @example
 * // After fetching from API:
 * dispatchOlxJson(props, 'content', data.idMap);
 *
 * // After parsing inline content:
 * dispatchOlxJson(props, 'inline', parseResult.idMap);
 */
export function dispatchOlxJson(
  props: { runtime: { logEvent: LogEventFn } },
  source: string,
  blocks: IdMap
): void {
  if (!blocks || Object.keys(blocks).length === 0) {
    return; // Nothing to dispatch
  }

  // Pass nested structure as-is - selectors will extract the correct language variant
  // based on runtime.locale.code
  props.runtime.logEvent(LOAD_OLXJSON, { source, blocks });
}

/**
 * Synchronously dispatch OLX content to Redux.
 *
 * BYPASSES lo_event's async queue for immediate state updates.
 * Use this for initial render where content must be available synchronously.
 *
 * For learning analytics logging, use dispatchOlxJson() instead.
 *
 * @param reduxStore - The Redux store (from store.init())
 * @param source - Source identifier (e.g., 'content')
 * @param blocks - IdMap of parsed blocks
 */
export function dispatchOlxJsonSync(
  reduxStore: any,
  source: string,
  blocks: IdMap
): void {
  if (!blocks || Object.keys(blocks).length === 0) {
    return;
  }

  // Dispatch nested structure directly - selectors will extract the correct language variant
  // based on runtime.locale.code
  reduxStore.dispatch({
    redux_type: 'EMIT_EVENT',
    type: 'lo_event',
    payload: JSON.stringify({ event: LOAD_OLXJSON, source, blocks })
  });
}

/**
 * Mark a block as loading in Redux.
 *
 * @param props - Component props (must include logEvent)
 * @param source - Source identifier
 * @param id - Block ID being loaded
 */
export function dispatchOlxJsonLoading(
  props: { runtime: { logEvent: LogEventFn } },
  source: string,
  id: string
): void {
  props.runtime.logEvent(OLXJSON_LOADING, { source, id });
}

/**
 * Mark a block as failed in Redux.
 *
 * @param props - Component props (must include logEvent)
 * @param source - Source identifier
 * @param id - Block ID that failed
 * @param error - Error information
 */
export function dispatchOlxJsonError(
  props: { runtime: { logEvent: LogEventFn } },
  source: string,
  id: string,
  error: string | Error
): void {
  const message = typeof error === 'string' ? error : error.message;
  props.runtime.logEvent(OLXJSON_ERROR, { source, id, error: { message } });
}

/**
 * Clear a source from Redux (or all sources if source is empty).
 *
 * @param props - Component props (must include logEvent)
 * @param source - Source to clear, or empty/undefined to clear all
 */
export function dispatchClearOlxJson(
  props: { runtime: { logEvent: LogEventFn } },
  source?: string
): void {
  props.runtime.logEvent(CLEAR_OLXJSON, { source });
}

// =============================================================================
// Initial State
// =============================================================================

export const initialOlxJsonState: OlxJsonState = {};

// =============================================================================
// Reducer
// =============================================================================

export function olxjsonReducer(
  state: OlxJsonState = initialOlxJsonState,
  action: any
): OlxJsonState {
  switch (action.type) {
    case LOAD_OLXJSON: {
      // Bulk load parsed content: { source: 'system', blocks: { [id]: { [lang]: OlxJson } } }
      // blocks is now the nested structure with language variants
      const { source, blocks } = action;
      if (!source || !blocks) return state;

      const entries: SourceState = {};
      for (const [id, langMap] of Object.entries(blocks)) {
        // Store the entire language map: { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
        entries[id] = {
          olxJson: langMap as any,  // Now stores { [lang: string]: OlxJson }
          loadingState: { status: 'ready' },
        };
      }

      return {
        ...state,
        [source]: {
          ...state[source],
          ...entries,
        },
      };
    }

    case OLXJSON_LOADING: {
      // Mark block as loading: { source, id }
      const { source, id } = action;
      if (!source || !id) return state;

      return {
        ...state,
        [source]: {
          ...state[source],
          [id]: {
            olxJson: state[source]?.[id]?.olxJson ?? null,
            loadingState: { status: 'loading' },
          },
        },
      };
    }

    case OLXJSON_ERROR: {
      // Mark block as failed: { source, id, error }
      const { source, id, error } = action;
      if (!source || !id) return state;

      return {
        ...state,
        [source]: {
          ...state[source],
          [id]: {
            olxJson: state[source]?.[id]?.olxJson ?? null,
            loadingState: { status: 'error' },
            error: { message: error?.message || String(error) },
          },
        },
      };
    }

    case CLEAR_OLXJSON: {
      // Clear a source: { source }
      const { source } = action;
      if (!source) return initialOlxJsonState;

      const { [source]: _, ...rest } = state;
      return rest;
    }

    default:
      return state;
  }
}

// =============================================================================
// Selectors
// =============================================================================

/**
 * Select a block's OlxJson from state, checking sources in priority order.
 *
 * @param state - Redux root state
 * @param sources - Array of source names in priority order (first match wins)
 * @param id - OlxKey to look up
 * @param locale - BCP 47 locale code (e.g., 'en-Latn-US'). Defaults to 'en-Latn-US' for backward compatibility.
 * @returns OlxJson if found and ready, undefined otherwise
 */
export function selectBlock(
  state: RootState,
  sources: string[],
  id: OlxKey | string,
  locale: string
): OlxJson | undefined {
  if (!locale) {
    throw new Error('selectBlock: locale parameter is required for language-aware rendering');
  }

  const olxjson = state.application_state?.olxjson;
  if (!olxjson) return undefined;

  for (const source of sources) {
    const entry = olxjson[source]?.[id];
    if (entry?.loadingState.status === 'ready' && entry.olxJson) {
      // Nested structure: { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
      const langVariant = extractLocalizedVariant(entry.olxJson as any, locale);

      if (langVariant && typeof langVariant === 'object' && (langVariant as any).tag) {
        return langVariant as OlxJson;
      }

      // No matching locale in this source - continue to next source
    }
  }
  return undefined;
}

/**
 * Select a block's full state (olxJson + loadingState + error).
 *
 * @param state - Redux root state
 * @param sources - Array of source names in priority order
 * @param id - OlxKey to look up
 * @returns BlockEntry if found in any source, undefined otherwise
 */
export function selectBlockState(
  state: RootState,
  sources: string[],
  id: OlxKey | string
): BlockEntry | undefined {
  const olxjson = state.application_state?.olxjson;
  if (!olxjson) return undefined;

  for (const source of sources) {
    const entry = olxjson[source]?.[id];
    if (entry) return entry;
  }
  return undefined;
}

/**
 * Check if all blocks in the given sources are ready (not loading).
 *
 * @param state - Redux root state
 * @param sources - Array of source names to check
 * @returns true if all blocks in all sources are ready
 */
export function selectBlocksReady(state: RootState, sources: string[]): boolean {
  const olxjson = state.application_state?.olxjson;
  if (!olxjson) return true; // No state = nothing loading

  for (const source of sources) {
    const sourceState = olxjson[source];
    if (!sourceState) continue;

    for (const entry of Object.values(sourceState)) {
      if (entry.loadingState.status === 'loading') {
        return false;
      }
    }
  }
  return true;
}

/**
 * Get all block IDs from the given sources.
 *
 * @param state - Redux root state
 * @param sources - Array of source names
 * @returns Array of all block IDs (may have duplicates if same ID in multiple sources)
 */
export function selectAllBlockIds(state: RootState, sources: string[]): string[] {
  const olxjson = state.application_state?.olxjson;
  if (!olxjson) return [];

  const ids: string[] = [];
  for (const source of sources) {
    const sourceState = olxjson[source];
    if (sourceState) {
      ids.push(...Object.keys(sourceState));
    }
  }
  return ids;
}

// =============================================================================
// React Hooks
// =============================================================================

/**
 * React hook to select a block from Redux.
 *
 * @param sources - Array of source names in priority order
 * @param id - OlxKey to look up
 * @param locale - BCP 47 locale code (e.g., 'en-Latn-US')
 * @returns OlxJson if found and ready, undefined otherwise
 */
export function useOlxJsonBlock(sources: string[], id: OlxKey | string, locale: string): OlxJson | undefined {
  if (!locale) {
    throw new Error('useOlxJsonBlock: locale is required');
  }
  return useSelector((state: RootState) => selectBlock(state, sources, id, locale));
}

/**
 * React hook to select a block's full state from Redux.
 *
 * @param sources - Array of source names in priority order
 * @param id - OlxKey to look up
 * @returns BlockEntry if found, undefined otherwise
 */
export function useOlxJsonBlockState(
  sources: string[],
  id: OlxKey | string
): BlockEntry | undefined {
  return useSelector((state: RootState) => selectBlockState(state, sources, id));
}

/**
 * React hook to check if all blocks in sources are ready.
 *
 * @param sources - Array of source names to check
 * @returns true if all blocks are ready
 */
export function useBlocksReady(sources: string[]): boolean {
  return useSelector((state: RootState) => selectBlocksReady(state, sources));
}
