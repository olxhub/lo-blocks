// packages/shared/lib/state/olxjson.ts
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

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import type {
  OlxJson, DefinitionKey, IdMap, UserLocale, VariantMap, RootState,
  LoadingStatus, VariantStatus, VariantStatusEntry,
  OlxJsonBlockEntry, OlxJsonSourceState, OlxJsonState,
} from '../types';
import type { LogEventFn } from '../player/client/render';


// =============================================================================
// Event Types
// =============================================================================

export const LOAD_OLXJSON = 'LOAD_OLXJSON';
export const OLXJSON_LOADING = 'OLXJSON_LOADING';
export const OLXJSON_TRANSLATING = 'OLXJSON_TRANSLATING';
export const OLXJSON_ERROR = 'OLXJSON_ERROR';
export const CLEAR_OLXJSON = 'CLEAR_OLXJSON';

// The content ledger's CONTENT_PARSED event lands parsed blocks in this slice
// too (the atomic-land fold — see store.ts and lib/state/content.ts). Kept as a
// string literal rather than importing from content.ts to avoid a cycle.
const CONTENT_PARSED = 'CONTENT_PARSED';

// =============================================================================
// Source-level read
// =============================================================================

/**
 * One content source's blocks as a server-shaped idMap
 * (id → variantMap → OlxJson) — the redux entries unwrapped from their
 * { olxJson, loadingState } wrappers. Memoized on the source map's
 * reference, which the reducer replaces only when content loads.
 *
 * For consumers that want the whole loaded index (e.g. studio's
 * cross-content search) rather than one block.
 */
export function useOlxJsonSourceIdMap(source: string): IdMap {
  const sourceMap: OlxJsonSourceState | undefined = useSelector(
    (state: RootState) => state.application_state?.olxjson?.[source],
  );
  return useMemo(() => {
    if (!sourceMap) return {};
    const idMap: IdMap = {};
    for (const [id, entry] of Object.entries(sourceMap)) {
      if (entry.olxJson) idMap[id] = entry.olxJson;
    }
    return idMap;
  }, [sourceMap]);
}

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
 * Mark a variant as translating (translation in flight).
 *
 * @param props - Component props (must include logEvent)
 * @param source - Source identifier
 * @param id - Block ID being translated
 * @param variant - Target locale variant being translated to
 */
export function dispatchOlxJsonTranslating(
  props: { runtime: { logEvent: LogEventFn } },
  source: string,
  id: string,
  variant: string
): void {
  props.runtime.logEvent(OLXJSON_TRANSLATING, { source, id, variant });
}

/**
 * Mark a block (or specific variant) as failed in Redux.
 *
 * Without `variant`: block-level error (initial fetch failed).
 * With `variant`: variant-level error (e.g., translation failed).
 *
 * @param props - Component props (must include logEvent)
 * @param source - Source identifier
 * @param id - Block ID that failed
 * @param error - Error information
 * @param variant - Optional: specific variant that failed
 */
export function dispatchOlxJsonError(
  props: { runtime: { logEvent: LogEventFn } },
  source: string,
  id: string,
  error: string | Error,
  variant?: string
): void {
  const message = typeof error === 'string' ? error : error.message;
  props.runtime.logEvent(OLXJSON_ERROR, { source, id, error: { message }, ...(variant && { variant }) });
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

/**
 * Merge a nested block idMap into one content source, preserving existing
 * variants and clearing variantStatus for variants that just arrived. Shared by
 * LOAD_OLXJSON and the content ledger's CONTENT_PARSED (atomic-land) fold.
 */
function mergeBlocksIntoSource(
  state: OlxJsonState,
  source: string,
  blocks: IdMap,
): OlxJsonState {
  if (!source || !blocks) return state;

  const entries: OlxJsonSourceState = {};
  for (const [id, variantMap] of Object.entries(blocks)) {
    // Merge with existing variants so a partial update (e.g., a new
    // translation) doesn't discard variants already in Redux.
    const existingEntry = state[source]?.[id];
    const existing = existingEntry?.olxJson;
    // Clear variantStatus for variants that just arrived (they're ready now)
    const oldVS = existingEntry?.variantStatus;
    let newVS: Record<string, VariantStatusEntry> | undefined;
    if (oldVS) {
      newVS = { ...oldVS };
      for (const key of Object.keys(variantMap as object)) {
        delete newVS[key];
      }
      if (Object.keys(newVS).length === 0) newVS = undefined;
    }
    entries[id] = {
      olxJson: { ...existing, ...variantMap as VariantMap },
      loadingState: { status: 'ready' },
      ...(newVS && { variantStatus: newVS }),
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

export function olxjsonReducer(
  state: OlxJsonState = initialOlxJsonState,
  action: any
): OlxJsonState {
  switch (action.type) {
    case LOAD_OLXJSON: {
      // Bulk load parsed content: { source: 'system', blocks: { [id]: { [lang]: OlxJson } } }
      const { source, blocks } = action;
      return mergeBlocksIntoSource(state, source, blocks);
    }

    case CONTENT_PARSED: {
      // The content ledger's atomic land: the SAME event that sets the ledger's
      // root/status also drops the parsed blocks here, under `blockSource`. This
      // is the whole cure for the race — root and blocks land together.
      const { blockSource, blocks } = action;
      if (!blockSource || !blocks) return state;
      return mergeBlocksIntoSource(state, blockSource, blocks);
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

    case OLXJSON_TRANSLATING: {
      // Mark a variant as translating: { source, id, variant }
      const { source, id, variant } = action;
      if (!source || !id || !variant) return state;

      const existing = state[source]?.[id];
      return {
        ...state,
        [source]: {
          ...state[source],
          [id]: {
            ...existing,
            olxJson: existing?.olxJson ?? null,
            loadingState: existing?.loadingState ?? { status: 'ready' },
            variantStatus: {
              ...existing?.variantStatus,
              [variant]: { status: 'translanguaging' },
            },
          },
        },
      };
    }

    case OLXJSON_ERROR: {
      // Mark block or variant as failed: { source, id, error, variant? }
      const { source, id, error, variant } = action;
      if (!source || !id) return state;

      const existing = state[source]?.[id];

      // Variant-level error (e.g., translation failed)
      if (variant) {
        return {
          ...state,
          [source]: {
            ...state[source],
            [id]: {
              ...existing,
              olxJson: existing?.olxJson ?? null,
              loadingState: existing?.loadingState ?? { status: 'ready' },
              variantStatus: {
                ...existing?.variantStatus,
                [variant]: { status: 'error', error: error?.message || String(error) },
              },
            },
          },
        };
      }

      // Block-level error (initial fetch failed).
      //
      // NO-CLOBBER: never overwrite a block that is already 'ready' with an
      // error. A late/stale failure (e.g. a 404 that lost the race to good
      // content landing) must not knock good content back to an error state.
      // Only an absent or still-loading block transitions to error.
      if (existing?.loadingState.status === 'ready' && existing.olxJson) {
        return state;
      }
      return {
        ...state,
        [source]: {
          ...state[source],
          [id]: {
            olxJson: existing?.olxJson ?? null,
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
 * Select a block from Redux by ID and locale.
 *
 * NOTE: This is written as a pure Redux selector (takes state
 * directly) rather than following the codebase idiom of props-based
 * functions, because it's called from pure selectors, which have
 * state only
 *
 * HACK/TODO: This has appeared throughout the codebase used directly
 * where props are available. We should probably have the standards
 * select/get/use breakdown so component code does NOT use this
 * directly, and break `props.runtime` abstraction boundaries.
 *
 * This is left as a TODO because we're merging a gigantic PR, and
 * feels a bit beyond scope.
 *
 * Callers should extract state and locale from props before calling:
 *   selectBlock(props.runtime.store.getState(), sources, definitionKey, props.runtime.locale.code)
 *
 * @param state - Redux root state
 * @param sources - Array of source names in priority order
 * @param id - DefinitionKey to look up
 * @param locale - User's current locale for language variant selection
 * @returns OlxJson if found and ready, undefined otherwise
 */
export function selectBlock(
  state: RootState,
  sources: string[],
  id: DefinitionKey,
  locale: UserLocale
): OlxJson | undefined {

  const olxjson = state.application_state?.olxjson;
  if (!olxjson) return undefined;

  for (const source of sources) {
    const entry = olxjson[source]?.[id];
    if (entry?.loadingState.status === 'ready' && entry.olxJson) {
      const langVariant = extractLocalizedVariant(entry.olxJson, locale);
      if (langVariant?.tag) {
        return langVariant;
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
 * @param id - DefinitionKey to look up
 * @returns OlxJsonBlockEntry if found in any source, undefined otherwise
 */
export function selectBlockState(
  state: RootState,
  sources: string[],
  id: DefinitionKey
): OlxJsonBlockEntry | undefined {
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

/**
 * Select variant tiers based on curation status.
 *
 * Classifies available variants into:
 * - curated: All content human-authored (generated absent)
 * - bestEffort: Any content machine-generated (generated present)
 *
 * Memoized to prevent unnecessary re-renders.
 */
export interface VariantTiers {
  curated: string[];
  bestEffort: string[];
  all: string[];  // All variants, curated first, then best-effort
}

/**
 * Select variant tiers from Redux state.
 * Returns memoized result - use in useSelector or wrap with useMemo in components.
 */
export function selectVariantTiers(state: RootState): VariantTiers {
  const olxjson = state.application_state?.olxjson;

  if (!olxjson) {
    return { curated: [], bestEffort: [], all: [] };
  }

  // Track variants by whether they have ONLY native content or ANY generated content
  const variantStatus: Record<string, 'curated' | 'mixed'> = {};

  // Scan all sources
  for (const sourceState of Object.values(olxjson)) {
    if (!sourceState) continue;

    // Each entry in sourceState is { id: blockEntry }
    // where blockEntry = { olxJson: { variant: OlxJson, ... }, ... }
    for (const blockEntry of Object.values(sourceState)) {
      if (blockEntry?.olxJson && typeof blockEntry.olxJson === 'object') {
        for (const [variant, olxJson] of Object.entries(blockEntry.olxJson)) {
          const isGenerated = !!olxJson.generated;

          if (isGenerated) {
            // If ANY block is generated, mark variant as mixed/bestEffort
            variantStatus[variant] = 'mixed';
          } else if (variantStatus[variant] !== 'mixed') {
            // Only mark as curated if we haven't already seen generated content
            variantStatus[variant] = 'curated';
          }
        }
      }
    }
  }

  // Separate into two arrays (no duplicates)
  const curated = Object.entries(variantStatus)
    .filter(([_, status]) => status === 'curated')
    .map(([variant, _]) => variant)
    .sort();

  const bestEffort = Object.entries(variantStatus)
    .filter(([_, status]) => status === 'mixed')
    .map(([variant, _]) => variant)
    .sort();

  return {
    curated,
    bestEffort,
    all: [...curated, ...bestEffort]
  };
}

// =============================================================================
// React Hooks
// =============================================================================

/**
 * React hook to select a block from Redux.
 *
 * @param sources - Array of source names in priority order
 * @param id - DefinitionKey to look up
 * @param locale - BCP 47 locale code (e.g., 'en-Latn-US')
 * @returns OlxJson if found and ready, undefined otherwise
 */
export function useOlxJsonBlock(sources: string[], id: DefinitionKey, locale: UserLocale): OlxJson | undefined {
  return useSelector((state: RootState) => selectBlock(state, sources, id, locale));
}

/**
 * React hook to select a block's full state from Redux.
 *
 * @param sources - Array of source names in priority order
 * @param id - DefinitionKey to look up
 * @returns OlxJsonBlockEntry if found, undefined otherwise
 */
export function useOlxJsonBlockState(
  sources: string[],
  id: DefinitionKey
): OlxJsonBlockEntry | undefined {
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

