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
import { refToOlxKey, allOlxKeys } from '@/lib/blocks/idResolver';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import type { OlxJson, OlxKey, OlxReference, ReduxStateKey, IdMap, BaselineProps, RuntimeProps, BlockDataResult } from '@/lib/types';
import type { LogEventFn } from '@/lib/render';
import { blockData } from '@/lib/state/redux';

export type OlxJsonResult = BlockDataResult & { olxJson: OlxJson | null };


// =============================================================================
// ensureBlock — non-hook fetch trigger (internal infrastructure)
// =============================================================================

/**
 * Dedup: once we've started a fetch for a given request, don't start another.
 *
 * Keyed by `source:requestProfile:olxKey` so that:
 * - Different sources can load the same block independently
 * - A change in user profile triggers re-fetch (the server may negotiate
 *   a different content variant)
 *
 * Three distinct concepts at play:
 * - **Content variant** (e.g. `ar-Arab-SA:no-audio`): What exists on the
 *   server — locale + other properties.
 * - **Content locale** (e.g. `ar-Arab-SA`): The language part of a variant.
 * - **User profile**: What we send to the server — preferred languages,
 *   bandwidth context, a11y needs. All dimensions feed into one negotiation
 *   with different weights (CSS cascade style). Explicit user choices are
 *   stronger signals in the same cascade, not a bypass.
 *
 * The dedup key is based on the request profile (what we send), not the
 * content variant (what we get back). Currently the only profile dimension
 * is locale, but this will grow (bandwidth, a11y, explicit overrides).
 *
 * On network failure (.catch), the key is removed to allow retry.
 * On API error (!data.ok — missing content, server error), the key is kept
 * to prevent retry storms.
 */
const ensuredIds = new Set<string>();

/**
 * Ensure a block's OlxJson is being loaded into Redux.
 *
 * If the block is unknown (not in Redux at all), dispatches OLXJSON_LOADING
 * and triggers an async fetch. If it's already known (loading, ready, or
 * error), this is a no-op.
 *
 * After a successful fetch, scans all loaded blocks for `target=` attributes
 * and recursively ensures those targets are loaded too. This prevents the
 * Ref deadlock: Ref loads itself, but nobody loads its target.
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
  const locale = props.runtime.locale.code;
  // Dedup on request profile — currently just locale, will grow (see comment above)
  const dedupKey = `${source}:${locale}:${olxKey}`;
  if (ensuredIds.has(dedupKey)) return;

  const state = props.runtime.store.getState();
  const blockState = selectBlockState(state, [source], olxKey);
  if (blockState) return; // Already known (loading, ready, or error)

  ensuredIds.add(dedupKey);
  dispatchOlxJsonLoading(props, source, olxKey);

  fetchOlxJson(olxKey, {
      headers: { 'Accept-Language': locale },
    })
    .then(data => {
      if (!data.ok) {
        // API error (404 missing content, 500 server error) — don't retry.
        // Key stays in ensuredIds to prevent retry storms.
        dispatchOlxJsonError(props, source, olxKey, data.error || `Failed to load ${olxKey}`);
      } else {
        dispatchOlxJson(props, source, data.idMap);
        // Recursively ensure blocks referenced by target= attributes
        ensureTargetBlocks(props, data.idMap, source);
      }
    })
    .catch(err => {
      // Network failure — remove from dedup set so ensuredIds won't block.
      // However, the Redux error state (set below) is a second gate: selectBlockState
      // returns truthy, so ensureBlock returns early at line 94. In practice, retry
      // requires clearing both gates — currently only a page reload does that.
      ensuredIds.delete(dedupKey);
      dispatchOlxJsonError(props, source, olxKey, err.message || `Failed to load ${olxKey}`);
    });
}

/**
 * Scan loaded blocks for target= attributes and ensure those targets.
 *
 * Called after a successful fetch. The idMap contains the fetched block plus
 * its static kids (from collectBlockWithKids). We scan ALL of them — if a
 * static kid has target=, we ensure that target too.
 *
 * Handles comma-separated targets, absolute refs (/foo), and scoped keys
 * (myList:#0:answer → ensures both myList and answer).
 *
 * Recursive: when a target loads, ITS targets get ensured in turn.
 */
function ensureTargetBlocks(props: BaselineProps, idMap: IdMap, source: string): void {
  for (const variantMap of Object.values(idMap)) {
    // Check any variant — targets don't change across languages
    const anyVariant = Object.values(variantMap)[0] as OlxJson | undefined;
    const target = anyVariant?.attributes?.target;
    if (typeof target !== 'string') continue;

    // Handle comma-separated targets
    const parts = target.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      // Strip /absolute and ./relative prefixes before decomposing
      const cleaned = part.startsWith('/') ? part.slice(1)
                    : part.startsWith('./') ? part.slice(2)
                    : part;
      for (const key of allOlxKeys(cleaned as ReduxStateKey)) {
        ensureBlock(props, key, source);
      }
    }
  }
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
