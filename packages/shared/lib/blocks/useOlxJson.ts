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
import { refToOlxKey, allOlxKeys } from '@/lib/types/id';
import { getRefAttributes } from '@/lib/blocks/attributeSchemas';
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
 * After a successful fetch, scans all loaded blocks for attributes that
 * reference other blocks (discovered from the zod schema via getRefAttributes)
 * and recursively ensures those are loaded too. This prevents the Ref
 * deadlock: Ref loads itself, but nobody loads its target.
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
        // Recursively ensure blocks referenced by ref-typed attributes
        ensureReferencedBlocks(props, data.idMap, source);
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
 * Scan loaded blocks for attributes that reference other blocks and ensure
 * those blocks are loaded.
 *
 * Which attributes to scan is determined by the block's zod schema — any
 * attribute tagged with a ref extractor (z_olxKey, z_reduxStateKey, z_reduxStateKeyList,
 * z_blockFieldRef, z_blockFieldRefList) is automatically discovered via
 * getRefAttributes(). Each schema knows how to extract block IDs from its
 * (possibly transformed) value.
 *
 * Called after a successful fetch. The idMap contains the fetched block plus
 * its static kids (from collectBlockWithKids). We scan ALL of them.
 *
 * Handles absolute refs (/foo) and scoped keys
 * (myList:#0:answer → ensures both myList and answer).
 *
 * Recursive: when a referenced block loads, ITS references get ensured in turn.
 */

function ensureReferencedBlocks(props: BaselineProps, idMap: IdMap, source: string): void {
  const blockRegistry = props.runtime.blockRegistry ?? {};
  for (const variantMap of Object.values(idMap)) {
    // Check any variant — refs don't change across languages
    const anyVariant = Object.values(variantMap)[0] as OlxJson | undefined;
    if (!anyVariant?.tag) continue;

    const block = blockRegistry[anyVariant.tag];
    const refAttrs = block?.attributes ? getRefAttributes(block.attributes) : [];

    for (const { name, extractRefs } of refAttrs) {
      const refValue = anyVariant.attributes?.[name];
      if (refValue == null) continue;

      const refs = extractRefs(refValue);
      for (const ref of refs) {
        // Strip /absolute and ./relative prefixes before decomposing
        const cleaned = ref.startsWith('/') ? ref.slice(1)
                      : ref.startsWith('./') ? ref.slice(2)
                      : ref;
        for (const key of allOlxKeys(cleaned as ReduxStateKey)) {
          // Skip blocks already in this idMap — they were just dispatched
          // in the same LOAD_OLXJSON event. Calling ensureBlock here would
          // race: OLXJSON_LOADING enqueued AFTER LOAD_OLXJSON overwrites
          // the block's 'ready' status back to 'loading'.
          if (idMap[key]) continue;
          ensureBlock(props, key, source);
        }
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

// TODO: Build these from actual OLX parsing rather than hardcoding the data structure.
/** Construct an OlxJson for a Spinner placeholder. */
function spinnerOlxJson(id: string): OlxJson {
  return {
    id: `_spinner_${id}` as OlxKey,
    tag: 'Spinner' as any,
    attributes: {},
    provenance: [],
  };
}

/** Construct an OlxJson for an ErrorNode placeholder. */
function errorOlxJson(id: string, message: string): OlxJson {
  return {
    id: `_error_${id}` as OlxKey,
    tag: 'ErrorNode' as any,
    attributes: {},
    kids: { message },
    provenance: [],
  };
}

/**
 * Hook to access multiple OlxJson blocks by IDs.
 *
 * Returns an OlxJson[] that is always the same length as `ids`.
 * Each entry is the real block, a Spinner (if loading), or an ErrorNode
 * (if errored or missing). Callers never see nulls — every entry is
 * renderable through the normal block pipeline.
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
  olxJsons: OlxJson[];
  allReady: boolean;
} {
  const sources = [source];
  const userLocale = props.runtime.locale.code;

  // Single useSelector — maps over all ids inside the selector.
  // Custom equality avoids re-renders when the resolved blocks haven't changed.
  const results = useSelector(
    (state: any) => ids.map(id => {
      const olxKey: OlxKey = id ? refToOlxKey(id as OlxReference) : '' as OlxKey;
      const entry = selectBlockState(state, sources, olxKey);
      if (!entry) return { olxJson: null, status: 'missing' as const };
      const status = entry.loadingState?.status;
      if (status === 'loading') return { olxJson: null, status: 'loading' as const };
      if (status === 'error') return { olxJson: null, status: 'error' as const, error: entry.error?.message };
      const stored = entry.olxJson;
      if (!stored) return { olxJson: null, status: 'ready' as const };
      const langVariant = extractLocalizedVariant(stored, userLocale);
      return { olxJson: langVariant || null, status: 'ready' as const };
    }),
    // Shallow-compare: re-render only when an entry's status or olxJson identity changes
    (a, b) => a.length === b.length && a.every((ai, i) => ai.status === b[i].status && ai.olxJson === b[i].olxJson)
  );

  // Trigger fetches for missing blocks (not a hook — fire-and-forget with dedup)
  useEffect(() => {
    for (const id of ids) {
      if (id) ensureBlock(props, id, source);
    }
  }, [JSON.stringify(ids), source, props.runtime.sideEffectFree, props.runtime.logEvent]);

  const olxJsons = results.map((r, i) => {
    if (r.olxJson) return r.olxJson;
    if (r.status === 'loading' || r.status === 'missing') return spinnerOlxJson(ids[i]);
    if (r.status === 'error') return errorOlxJson(ids[i], r.error || `Error loading "${ids[i]}"`);
    return errorOlxJson(ids[i], `Block "${ids[i]}" not found`);
  });

  const allReady = results.every(r => r.status === 'ready' && r.olxJson !== null);

  return { olxJsons, allReady };
}
