// packages/shared/lib/blocks/useOlxJson.ts
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
import {
  selectBlockState,
  contentFreshness,
} from '@/lib/state/olxjson';
import { ensureBlock } from '@/lib/blocks/ensure';
import { qualifyDefinitionRef, splitNs, joinNs, asDefinitionKey, parseDefinitionKey, leafDefinitionKeyFromStateKey, asStateKey } from '@/lib/types/id-grammar';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import type { OlxJson, DefinitionKey, DefinitionRef, BaselineProps, RuntimeProps, BlockDataResult } from '@/lib/types';
import type { AppError } from '@/lib/types/errors';
import { safeStringify } from '@/lib/util';
import type { LogEventFn } from '@/lib/render';
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

  // Blocks keep a plain ready/loading/error — the ledger's Freshness is
  // mapped to it here (contentFreshness is the one policy point):
  //   ready → resolved content; failed → error; everything else → loading.
  // The locale is the request PROFILE: a resolution under a different
  // locale reads not-ready, so the hook's effect refetches after a locale
  // change (without the profile, an entry resolved under the old locale
  // reads ready forever and no refetch ever fires).
  const fresh = contentFreshness(blockState, props.runtime.locale.code);

  if (fresh === 'failed') {
    return {
      olxJson: null,
      ...blockData('error', blockState.ledger?.attempt?.lastError || `Error loading "${definitionKey}"`)
    };
  }

  if (fresh !== 'ready') {
    return { olxJson: null, ...blockData('loading') };
  }

  const stored = blockState.olxJson;
  if (!stored) {
    return { olxJson: null, ...blockData('ready') };
  }

  const userLocale = props.runtime.locale.code;
  const langVariant = extractLocalizedVariant(stored, userLocale);

  return { olxJson: langVariant || null, ...blockData('ready') };
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

/**
 * Derived DefinitionKey for a block's RENDER error. Uses a distinct
 * `_renderError_` prefix (load errors use `_error_`) so the two never clobber
 * each other under one key — and so the dispatched node and the on-screen
 * DisplayError can share exactly one key. Reduces a scoped StateKey
 * (e.g. "CONTENT/list:#0:answer") to its leaf definition first, because
 * sentinelKey → parseDefinitionKey throws on a scope marker.
 */
export function renderErrorKey(id: string): DefinitionKey {
  return sentinelKey(leafDefinitionKeyFromStateKey(asStateKey(id)), '_renderError_');
}

/**
 * Construct an ErrorNode OlxJson carrying a full AppError, at the
 * `_renderError_` derived DefinitionKey for `id` ({@link renderErrorKey}). Used
 * by the render-error path: a render failure of block `id` becomes an ErrorNode
 * here (AppError as attributes), dispatched into olxjson — keyed + in the event
 * log, and NOT persisted (so it reconstructs away when the underlying bug is
 * fixed).
 *
 * This node is serialized (save_blob JSON, BroadcastChannel structured clone),
 * so its attributes MUST be JSON-safe. `AppError.technical` is `any`, so we
 * coerce it to a string — a non-JSON value (Error, React element, function,
 * circular) would otherwise throw DataCloneError on tab-sync. Rich/non-JSON
 * error detail belongs in the boundary's live DisplayError, never in the node.
 */
export function renderErrorOlxJson(id: string, error: AppError): OlxJson {
  // Only include defined, JSON-safe string fields (no `undefined` keys).
  const attributes: Record<string, string> = { message: error.message };
  if (error.title) attributes.title = error.title;
  if (error.stack) attributes.stack = error.stack;
  if (error.technical != null) {
    attributes.technical = safeStringify(error.technical);
  }
  return {
    id: renderErrorKey(id),
    tag: 'ErrorNode' as any,
    attributes,
    kids: [],
    source: SYNTHETIC_SOURCE,
    parseDeps: [],
  };
}
