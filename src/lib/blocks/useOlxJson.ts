// src/lib/blocks/useOlxJson.ts
//
// OlxJson content access — fetch-on-demand from Redux.
//
// Two entry points:
// - ensureBlock(): Non-hook. Triggers async fetch if block is unknown.
//   Safe to call from useEffect, event handlers, etc. Internal infrastructure
//   — block authors should not call this directly.
// - useOlxJson(): Hook. Reads block from Redux + triggers fetch if missing.
//
'use client';

import { useSelector } from 'react-redux';
import { useEffect } from 'react';
import { fetchOlxJson } from '@/lib/content/fetchOlxJson';
import {
  selectBlockState,
  dispatchOlxJsonLoading,
  dispatchOlxJson,
  dispatchOlxJsonError
} from '@/lib/state/olxjson';
import { refToOlxKey } from '@/lib/blocks/idResolver';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import type { OlxJson, OlxKey, OlxReference, BaselineProps, RuntimeProps, BlockDataResult } from '@/lib/types';
import type { LogEventFn } from '@/lib/render';
import { blockData } from '@/lib/state/redux';

export type OlxJsonResult = BlockDataResult & { olxJson: OlxJson | null };


// =============================================================================
// ensureBlock — non-hook fetch trigger (internal infrastructure)
// =============================================================================

/**
 * Dedup: once we've started a fetch for an ID, don't start another.
 *
 * Module-level, never cleared — same pattern as translationsInFlight in
 * useTranslation.ts. By design: we want blocks cached client-side for the
 * session. The Set is bounded by the number of distinct blocks (text+JSON,
 * not large). Server-side content changes are a cache invalidation concern,
 * not a memory concern.
 */
const ensuredIds = new Set<string>();

/**
 * Ensure a block's OlxJson is being loaded into Redux.
 *
 * If the block is unknown (not in Redux at all), dispatches OLXJSON_LOADING
 * and triggers an async fetch. If it's already known (loading, ready, or
 * error), this is a no-op.
 *
 * NOT a hook — safe to call from useEffect, event handlers, callbacks, etc.
 * Do NOT call from render functions or Redux selectors.
 *
 * Internal infrastructure: called by useOlxJson and useValue. Block authors
 * should not need to call this directly.
 */
export function ensureBlock(
  props: BaselineProps,
  id: string | OlxReference | null | undefined,
  source: string = 'content'
): void {
  if (!id || props.runtime.sideEffectFree) return;

  const olxKey: OlxKey = refToOlxKey(id as OlxReference);
  if (ensuredIds.has(olxKey)) return;

  const state = props.runtime.store.getState();
  const blockState = selectBlockState(state, [source], olxKey);
  if (blockState) return; // Already known (loading, ready, or error)

  ensuredIds.add(olxKey);
  dispatchOlxJsonLoading(props, source, olxKey);

  fetchOlxJson(olxKey, {
      headers: { 'Accept-Language': props.runtime.locale.code },
    })
    .then(data => {
      if (!data.ok) {
        dispatchOlxJsonError(props, source, olxKey, data.error || `Failed to load ${olxKey}`);
      } else {
        dispatchOlxJson(props, source, data.idMap);
      }
    })
    .catch(err => {
      dispatchOlxJsonError(props, source, olxKey, err.message || `Failed to load ${olxKey}`);
    });
}

// =============================================================================
// useOlxJson — hook for reading + auto-fetching
// =============================================================================

/**
 * Hook to access OlxJson by ID from Redux.
 *
 * - Reads from Redux state
 * - If not found and not sideEffectFree, triggers a fetch via ensureBlock
 * - Returns BlockDataResult & { olxJson }
 *
 * @param props - Component props (must include logEvent, sideEffectFree)
 * @param id - The OLX ID to look up
 * @param source - Content source (default: 'content')
 */
export function useOlxJson(
  props: RuntimeProps,
  id: OlxReference | null,
  source: string = 'content'
): OlxJsonResult {
  // Compute olxKey outside hooks — empty string for null id (won't match anything)
  const olxKey: OlxKey = id ? refToOlxKey(id) : '' as OlxKey;

  // Read from Redux - always call hook (Rules of Hooks)
  const blockState = useSelector((state: any) =>
    id ? selectBlockState(state, [source], olxKey) : undefined
  );

  // Trigger fetch for missing blocks - always call hook (Rules of Hooks)
  useEffect(() => {
    if (id && !blockState) {
      ensureBlock(props, id, source);
    }
  }, [id, blockState, olxKey, source, props.runtime.sideEffectFree, props.runtime.logEvent]);

  // Handle null/undefined id - return after hooks are called
  if (!id) {
    return { olxJson: null, ...blockData('ready') };
  }

  // Return based on Redux state
  if (!blockState) {
    return { olxJson: null, ...blockData('loading') };
  }

  const status = blockState.loadingState?.status;

  if (status === 'loading') {
    return { olxJson: null, ...blockData('loading') };
  }

  if (status === 'error') {
    return {
      olxJson: null,
      ...blockData('error', blockState.error?.message || `Error loading "${olxKey}"`)
    };
  }

  // Extract the language variant from nested structure
  const stored = blockState.olxJson;
  if (!stored) {
    return { olxJson: null, ...blockData('ready') };
  }

  const userLocale = props.runtime.locale.code;
  const langVariant = extractLocalizedVariant(stored, userLocale);

  return { olxJson: langVariant || null, ...blockData('ready') };
}

/**
 * Hook to access multiple OlxJson blocks by IDs.
 *
 * @param props - Component props (must include logEvent, sideEffectFree)
 * @param ids - Array of OLX IDs to look up
 * @param source - Content source (default: 'content')
 */
export function useOlxJsonMultiple(
  props: RuntimeProps,
  ids: OlxReference[],
  source: string = 'content'
): {
  olxJsons: (OlxJson | null)[];
  anyLoading: boolean;
  firstError: string | null;
  allReady: boolean;
} {
  // Call useOlxJson for each ID
  // Note: Array length must be stable across renders (React rules of hooks)
  const results = ids.map(id => useOlxJson(props, id, source));

  const olxJsons = results.map(r => r.olxJson);
  const anyLoading = results.some(r => r.loading);
  const firstError = results.find(r => r.error)?.error || null;
  const allReady = results.every(r => r.ready && r.olxJson !== null);

  return { olxJsons, anyLoading, firstError, allReady };
}
