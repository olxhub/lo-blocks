// packages/shared/lib/player/client/useOlxJson.ts
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
import { adoptFieldState } from '@/lib/state/store';
import { qualifyDefinitionRef, allDefinitionKeysFromStateKey, stateKeyForGlobalRef, parseAnyStateRef, splitNs, joinNs, asDefinitionKey, parseDefinitionKey } from '@/lib/types/id-grammar';
import { getRefAttributes } from '@/lib/blocks/attributeSchemas';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import type { OlxJson, DefinitionKey, DefinitionRef, StateKey, IdMap, BaselineProps, RuntimeProps, BlockDataResult } from '@/lib/types';
import { blockData } from '@/lib/state/redux';
import type { LofsCanonical } from '@/lib/types/address';

/**
 * Source value for synthetic OlxJson nodes (spinners, error placeholders,
 * render-error nodes) that don't come from a real file.
 *
 * Future: render-error nodes could carry the failing block's real source
 * here, enabling "clear error when source file is re-parsed" workflows.
 */
const SYNTHETIC_SOURCE = '' as LofsCanonical;

export type OlxJsonResult = BlockDataResult & { olxJson: OlxJson | null };


// =============================================================================
// ensureBlock — non-hook fetch trigger (internal infrastructure)
// =============================================================================

/**
 * Dedup: once we've started a fetch for a given request, don't start another.
 *
 * Keyed by `source:requestProfile:definitionKey` so that:
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
  id: string | DefinitionRef | null | undefined,
  source: string = 'content'
): void {
  if (!id || props.runtime.sideEffectFree) return;

  const definitionKey: DefinitionKey = qualifyDefinitionRef(id as DefinitionRef, props.runtime.ns);
  const locale = props.runtime.locale.code;
  // Dedup on request profile — currently just locale, will grow (see comment above)
  const dedupKey = `${source}:${locale}:${definitionKey}`;
  if (ensuredIds.has(dedupKey)) return;

  // Declared-source gate (INTERIM — see lib/state/content.ts). Inline/files
  // content is parsed locally and must never be server-fetched: an absent block
  // is genuinely missing, not "go fetch". Scoped to the RENDER TREE via the
  // runtime context (RenderOLX sets it from its own declared source), so one
  // inline render can't suppress fetching for unrelated content — the previous
  // ledger scan latched onto (blockSource, ns) for the whole session, breaking
  // sibling trees that legitimately needed a fetch.
  if (props.runtime.localContent) return;

  const state = props.runtime.store.getState();

  const blockState = selectBlockState(state, [source], definitionKey);
  // Already known (loading or ready) — nothing to do. An ERRORED entry is not
  // "known", it is a failed attempt: re-arming is the only way a block that
  // failed for a transport reason ever comes back without a page reload. The
  // storm guard is `ensuredIds` above, which the fetch path clears only for
  // failures worth retrying.
  if (blockState && blockState.loadingState?.status !== 'error') return;

  ensuredIds.add(dedupKey);
  dispatchOlxJsonLoading(props, source, definitionKey);

  fetchOlxJson(definitionKey, {
      headers: { 'Accept-Language': locale },
    })
    .then(data => {
      if (!data.ok) {
        // API error (404 missing content, 500 server error, non-JSON body).
        // The marker MUST move to 'error' — an unclearable 'loading' marker is
        // a permanent spinner. Transport-shaped failures (5xx, HTML instead of
        // JSON) release the dedup key so the block can be attempted again;
        // a definitive 404 keeps it, to prevent retry storms.
        if (data.retryable) ensuredIds.delete(dedupKey);
        dispatchOlxJsonError(props, source, definitionKey, data.error || `Failed to load ${definitionKey}`);
      } else {
        // Field state rides the content response (fields-design 2b):
        // adopt BEFORE the content dispatch so blocks never render from
        // defaults and then flicker to saved state.
        adoptFieldState(data.fieldState);
        dispatchOlxJson(props, source, data.idMap);
        // Recursively ensure blocks referenced by ref-typed attributes
        ensureReferencedBlocks(props, data.idMap, source);
        // A "successful" response that doesn't actually contain the block we
        // asked for clears nothing: dispatchOlxJson no-ops on an empty idMap,
        // and LOAD_OLXJSON only touches the ids it carries — so the marker we
        // wrote at the top of this function would sit there as 'loading'
        // forever. Say so instead. (Harmless when the block arrived by some
        // other route in the meantime: the ERROR fold no-clobbers content.)
        if (!data.idMap?.[definitionKey]) {
          dispatchOlxJsonError(
            props, source, definitionKey,
            `Content fetch for "${definitionKey}" succeeded but the response did not contain that block`,
          );
        }
      }
    })
    .catch(err => {
      // Network failure — release the dedup key AND land an error marker (never
      // leave 'loading' behind). Both gates are now retry-permeable: the early
      // return above ignores errored entries, so the next mount re-attempts.
      ensuredIds.delete(dedupKey);
      dispatchOlxJsonError(props, source, definitionKey, err.message || `Failed to load ${definitionKey}`);
    });
}

/**
 * Scan loaded blocks for attributes that reference other blocks and ensure
 * those blocks are loaded.
 *
 * Which attributes to scan is determined by the block's zod schema — any
 * attribute tagged with a ref extractor (z_stateRef, z_stateRefList,
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
        // extractRefs returns Zod-validated values — may include system-generated
        // _-prefixed bare refs since z_stateRef uses the permissive validator.
        const qualifiedKey = stateKeyForGlobalRef(parseAnyStateRef(ref), props.runtime.ns);
        for (const defKey of allDefinitionKeysFromStateKey(qualifiedKey)) {
          // Skip blocks already in this idMap — they were just dispatched
          // in the same LOAD_OLXJSON event. Calling ensureBlock here would
          // race: OLXJSON_LOADING enqueued AFTER LOAD_OLXJSON overwrites
          // the block's 'ready' status back to 'loading'.
          if (idMap[defKey]) continue;
          ensureBlock(props, defKey, source);
        }
      }
    }
  }
}

// =============================================================================
// Selector trio pattern for single OlxJson
// =============================================================================

/**
 * Pure selector: reads OlxJson by ID from Redux state.
 *
 * Does NOT trigger fetches — just reads what's already in Redux.
 * Use in blueprint functions (advance, canAdvance, actions) where hooks
 * are unavailable, or inside useSelector for reactive subscriptions.
 *
 * @param state - Redux state
 * @param props - Component props (for locale)
 * @param id - The OLX ID to look up
 * @param source - Content source (default: 'content')
 */
export function selectOlxJson(
  state: any,
  props: BaselineProps,
  id: DefinitionRef | null,
  source: string = 'content'
): OlxJsonResult {
  if (!id) {
    return { olxJson: null, ...blockData('ready') };
  }

  const definitionKey: DefinitionKey = qualifyDefinitionRef(id, props.runtime.ns);
  const blockState = selectBlockState(state, [source], definitionKey);

  if (!blockState) {
    return { olxJson: null, ...blockData('loading') };
  }

  const status = blockState.loadingState?.status;
  const stored = blockState.olxJson;
  const userLocale = props.runtime.locale.code;
  const langVariant = stored ? extractLocalizedVariant(stored, userLocale) : null;

  // DATA WINS. A loading/error marker sitting beside content we already have is
  // stale — the reducer refuses to write one (NO-SHADOW in lib/state/olxjson.ts),
  // but state can also arrive from replay, a server fold, or an older client, so
  // the read path refuses to honour one too. Rendering the content we hold beats
  // spinning forever next to it.
  if (langVariant) {
    return { olxJson: langVariant, ...blockData('ready') };
  }

  if (status === 'loading') {
    return { olxJson: null, ...blockData('loading') };
  }

  if (status === 'error') {
    return {
      olxJson: null,
      ...blockData('error', blockState.error?.message || `Error loading "${definitionKey}"`)
    };
  }

  return { olxJson: null, ...blockData('ready') };
}

/**
 * One-shot imperative form: grabs current state and calls selectOlxJson.
 *
 * Use when you need OlxJson in a callback or non-reactive context.
 * Does NOT trigger fetches.
 */
export function getOlxJson(
  props: RuntimeProps,
  id: DefinitionRef | null,
  source: string = 'content'
): OlxJsonResult {
  const state = props.runtime.store.getState();
  return selectOlxJson(state, props, id, source);
}

/**
 * Hook to access OlxJson by ID from Redux.
 *
 * - Reads from Redux via selectOlxJson
 * - If not found and not sideEffectFree, triggers a fetch via ensureBlock
 * - Returns BlockDataResult & { olxJson }
 *
 * @param props - Component props (must include logEvent, sideEffectFree)
 * @param id - The OLX ID to look up
 * @param source - Content source (default: 'content')
 */
export function useOlxJson(
  props: RuntimeProps,
  id: DefinitionRef | null,
  source: string = 'content'
): OlxJsonResult {
  // Compute definitionKey outside hooks — empty string for null id (won't match anything)
  const definitionKey: DefinitionKey = id ? qualifyDefinitionRef(id, props.runtime.ns) : '' as DefinitionKey;

  // Read from Redux using the pure selector
  const result = useSelector(
    (state: any) => selectOlxJson(state, props, id, source),
    // Shallow equality on the result object
    (a, b) => a.status === b.status && a.olxJson === b.olxJson && a.error === b.error
  );

  // Trigger fetch for missing blocks - always call hook (Rules of Hooks)
  useEffect(() => {
    if (id && result.loading) {
      ensureBlock(props, id, source);
    }
  }, [id, result.loading, definitionKey, source, props.runtime.sideEffectFree, props.runtime.logEvent]);

  return result;
}

// TODO: Build these from actual OLX parsing rather than hardcoding the data structure.

/** Build a namespace-qualified sentinel DefinitionKey: ns/_prefix_bareId.
 *  Requires a qualified key — render flows always deal in qualified keys
 *  by the time placeholders are constructed; a bare id here means a caller
 *  skipped namespace resolution. */
function sentinelKey(id: string, prefix: string): DefinitionKey {
  const { ns, path } = splitNs(parseDefinitionKey(id));
  return asDefinitionKey(joinNs(ns, `${prefix}${path}`));
}

/** Construct an OlxJson for a Spinner placeholder. */
function spinnerOlxJson(id: string): OlxJson {
  return {
    id: sentinelKey(id, '_spinner_'),
    tag: 'Spinner' as any,
    attributes: {},
    source: SYNTHETIC_SOURCE,
    parseDeps: [],
  };
}

/** Construct an OlxJson for an ErrorNode placeholder. */
function errorOlxJson(id: string, message: string): OlxJson {
  return {
    id: sentinelKey(id, '_error_'),
    tag: 'ErrorNode' as any,
    attributes: { message },
    kids: [],
    source: SYNTHETIC_SOURCE,
    parseDeps: [],
  };
}

// Render-time exceptions no longer become synthetic OLX error-nodes injected
// into the content index. RenderOLX's ErrorBoundary logs a CONTENT_RENDER_FAILED
// event into the content ledger (lib/state/content.ts) and shows DisplayError
// directly — one representation, on the normal event path, no sync dispatch.

// =============================================================================
// Selector trio pattern for multiple OlxJson blocks
// =============================================================================

type OlxJsonMultipleResult = {
  olxJson: OlxJson | null;
  status: 'ready' | 'loading' | 'error' | 'missing';
  error?: string;
};

/**
 * Pure selector: reads multiple OlxJson blocks by IDs from Redux state.
 *
 * Does NOT trigger fetches — just reads what's already in Redux.
 * Returns results array with status + olxJson (null for unresolved blocks).
 * The hook layer creates Spinner/ErrorNode placeholders to avoid re-render churn.
 *
 * @param state - Redux state
 * @param props - Component props (for locale)
 * @param ids - Array of OLX IDs to look up
 * @param source - Content source (default: 'content')
 */
export function selectOlxJsonMultiple(
  state: any,
  props: BaselineProps,
  ids: DefinitionRef[],
  source: string = 'content'
): {
  results: OlxJsonMultipleResult[];
  allReady: boolean;
} {
  const sources = [source];
  const userLocale = props.runtime.locale.code;

  const results: OlxJsonMultipleResult[] = ids.map(id => {
    const definitionKey: DefinitionKey = id ? qualifyDefinitionRef(id as DefinitionRef, props.runtime.ns) : '' as DefinitionKey;
    const entry = selectBlockState(state, sources, definitionKey);
    if (!entry) return { olxJson: null, status: 'missing' as const };
    const status = entry.loadingState?.status;
    const stored = entry.olxJson;
    const langVariant = stored ? extractLocalizedVariant(stored, userLocale) : null;
    // DATA WINS over a stale marker — see selectOlxJson above.
    if (langVariant) return { olxJson: langVariant, status: 'ready' as const };
    if (status === 'loading') return { olxJson: null, status: 'loading' as const };
    if (status === 'error') return { olxJson: null, status: 'error' as const, error: entry.error?.message };
    return { olxJson: null, status: 'ready' as const };
  });

  const allReady = results.every(r => r.status === 'ready' && r.olxJson !== null);

  return { results, allReady };
}

/**
 * One-shot imperative form: grabs current state and calls selectOlxJsonMultiple.
 *
 * Use when you need OlxJson[] in a callback or non-reactive context.
 * Does NOT trigger fetches.
 */
export function getOlxJsonMultiple(
  props: RuntimeProps,
  ids: DefinitionRef[],
  source: string = 'content'
): {
  olxJsons: OlxJson[];
  allReady: boolean;
} {
  const state = props.runtime.store.getState();
  const { results, allReady } = selectOlxJsonMultiple(state, props, ids, source);

  // Create placeholders for unresolved blocks
  const olxJsons = results.map((r, i) => {
    if (r.olxJson) return r.olxJson;
    if (r.status === 'loading' || r.status === 'missing') return spinnerOlxJson(ids[i]);
    if (r.status === 'error') return errorOlxJson(ids[i], r.error || `Error loading "${ids[i]}"`);
    return errorOlxJson(ids[i], `Block "${ids[i]}" not found`);
  });

  return { olxJsons, allReady };
}

/**
 * Hook to access multiple OlxJson blocks by IDs.
 *
 * Returns an OlxJson[] that is always the same length as `ids`.
 * Each entry is the real block, a Spinner (if loading), or an ErrorNode
 * (if errored or missing). Callers never see nulls — every entry is
 * renderable through the normal block pipeline.
 *
 * Equality check compares status + olxJson identity, not placeholder objects,
 * to prevent re-render churn from loading/error states.
 *
 * @param props - Component props (must include logEvent, sideEffectFree)
 * @param ids - Array of OLX IDs to look up
 * @param source - Content source (default: 'content')
 */
export function useOlxJsonMultiple(
  props: RuntimeProps,
  ids: DefinitionRef[],
  source: string = 'content'
): {
  olxJsons: OlxJson[];
  allReady: boolean;
} {
  // Read from Redux using the pure selector
  // Equality compares status (not placeholder objects) to avoid re-render churn
  const { results, allReady } = useSelector(
    (state: any) => selectOlxJsonMultiple(state, props, ids, source),
    // Compare status + olxJson identity (placeholders created AFTER this check)
    (a, b) => a.allReady === b.allReady &&
              a.results.length === b.results.length &&
              a.results.every((ar, i) => {
                const br = b.results[i];
                return ar.status === br.status &&
                       ar.olxJson === br.olxJson &&
                       ar.error === br.error;
              })
  );

  // Trigger fetches for missing blocks (not a hook — fire-and-forget with dedup)
  useEffect(() => {
    for (const id of ids) {
      if (id) ensureBlock(props, id, source);
    }
  }, [JSON.stringify(ids), source, props.runtime.sideEffectFree, props.runtime.logEvent]);

  // Create placeholders AFTER equality check to avoid re-render churn
  const olxJsons = results.map((r, i) => {
    if (r.olxJson) return r.olxJson;
    if (r.status === 'loading' || r.status === 'missing') return spinnerOlxJson(ids[i]);
    if (r.status === 'error') return errorOlxJson(ids[i], r.error || `Error loading "${ids[i]}"`);
    return errorOlxJson(ids[i], `Block "${ids[i]}" not found`);
  });

  return { olxJsons, allReady };
}
