// packages/shared/lib/blocks/useRenderedBlock.tsx
//
// Hooks for rendering OLX blocks to React elements.
//
// Two modes:
// - useKids: Synchronous rendering via renderCompiledKids (for normal use)
// - useRenderedBlock: Can trigger async load for dynamic references
//
// The key insight: initial render is synchronous. Content is already in Redux
// (or idMap for legacy). Async loading is only for dynamic content loaded later.
//
// useKids also evaluates `when=` expressions on children, filtering out
// blocks whose condition is false. This enables adaptive content.
//
'use client';

import React, { useEffect } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { useOlxJson, selectOlxJson } from '@/lib/blocks/useOlxJson';
import { useBlocksReadyForSources } from '@/lib/blocks/useBlocksReady';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { render, renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';
import TranslatingIndicator from '@/lib/i18n/TranslatingIndicator';
import type { DefinitionRef, StateKey, BlockDataResult, OlxJson, RuntimeProps } from '@/lib/types';
import { blockData } from '@/lib/state/redux';
import { leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import { ensureInstance } from './ensure';
import {
  selectFieldFreshness, selectFieldAttempt, type FreshnessPolicy, type Freshness,
} from '@/lib/state/fieldLedger';
import { selectKidsJson } from './staticDynamicDom';
import { selectInstanceStateKeys } from './staticDom';

export type RenderedBlockResult = BlockDataResult & {
  block: React.ReactNode;
  // TODO: Always return an OlxJson (e.g. { tag: 'Spinner', ... } or { tag: 'DisplayError', ... })
  // so callers never need null checks. For now, absent during loading/error.
  olxJson?: OlxJson;
};

/**
 * Hook to render a block by state key.
 *
 * Reads block data from Redux via useOlxJson. If not found, triggers a fetch.
 * Returns { block, ready, error } for handling loading/error states.
 *
 * @param props - Component props (nodeInfo, blockRegistry, olxJsonSources, etc.)
 * @param stateKey - The StateKey identifying which runtime instance to render
 * @param source - Content source for Redux lookup (default: 'content')
 */
// ─── The instance hook stack ────────────────────────────────────────────────
//
// THE INVARIANT: every rendered block instance enters through these
// hooks; the hooks ensure everything the instance needs (content and
// state today, code eventually — blocks/ensure.ts); render() assumes
// readiness and fails fast.

export interface InstanceOptions {
  source?: string;
  /** Freshness the caller demands of the instance's state — default
   * currentLoad. Pass policies.ephemeral for scratch pages that want no
   * server state. (fieldLedger.ts — offlineWindow is the breadcrumb
   * toward offline operation.) */
  policy?: FreshnessPolicy;
}

/** How an instance's state freshness reads as block-data status. */
function stateBlockData(
  fresh: Freshness,
  stateKey: StateKey,
  attempt?: { failures: number; startedAt: number; lastError?: string },
): BlockDataResult | null {
  switch (fresh) {
    case 'ready':
      return null; // no objection — content decides
    case 'failed': {
      const tried = attempt
        ? ` Tried at ${new Date(attempt.startedAt).toLocaleTimeString()}, `
          + `${attempt.failures} failure${attempt.failures === 1 ? '' : 's'}`
          + (attempt.lastError ? `: ${attempt.lastError}` : '')
        : '';
      return blockData('error', `Could not load state for "${stateKey}".${tried}`);
    }
    default: // pending | retry-wait | unknown — a fetch is coming or in flight
      return blockData('loading');
  }
}

/**
 * The STATE GATE for one rendered instance: resolves the instance's
 * whole state-key closure (root + statically-reachable descendants,
 * selectInstanceStateKeys) through the state lane and reports the
 * aggregate as plain block data. Gating only the root key would leave
 * the instance's children free to write-from-empty — the closure is
 * what makes the client residency invariant hold for a subtree.
 *
 * For scoping containers that render instances through templates
 * (DynamicList, MasteryBank) rather than by StateKey: call this with
 * the instance's root key and hold rendering until `ready`.
 * useRenderedBlock/Multi call it internally — most code never touches
 * it directly.
 */
export function useInstanceState(
  props: RuntimeProps,
  rootKey: StateKey | null,
  { source = 'content', policy }: InstanceOptions = {},
): BlockDataResult {
  const view = useSelector(
    (state: any) => {
      if (!rootKey) return { keys: [] as StateKey[], gate: null as BlockDataResult | null };
      const keys = selectInstanceStateKeys(state, props, rootKey, source);
      // Aggregate: any failure wins (surface it), else any non-ready
      // key holds the gate, else ready.
      let gate: BlockDataResult | null = null;
      for (const key of keys) {
        const fresh = selectFieldFreshness(state, key, { policy });
        const objection = stateBlockData(fresh, key,
          fresh === 'failed' ? selectFieldAttempt(state, key) : undefined);
        if (objection?.error) { gate = objection; break; }
        gate ??= objection;
      }
      return { keys, gate };
    },
    (a, b) => a.keys.length === b.keys.length
      && a.gate?.status === b.gate?.status && a.gate?.error === b.gate?.error
      && a.keys.every((k, i) => k === b.keys[i]),
  );

  useEffect(() => {
    if (view.keys.length > 0) ensureInstance(props, view.keys, { policy });
    // ensureInstance is idempotent and ledger-gated; the joined keys and
    // gate status re-arm it as content arrives (closure grows) and as
    // failures become retry-eligible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.keys.join('|'), view.gate?.status, source, props.runtime.sideEffectFree]);

  return view.gate ?? blockData('ready');
}

/**
 * Render a block INSTANCE by StateKey: content via useOlxJson (the leaf
 * definition — OlxJson doesn't need state), field state via the state
 * lane (ensureInstance + the field ledger). Returns a renderable
 * `block` in every case: the real block, a Spinner while any lane
 * loads, a DisplayError on failure. A block never renders — and so
 * never writes — before its state resolves: that is the client half of
 * the residency invariant (a premature write would fold from empty and
 * ADOPT's local-wins rule would discard the stored bucket).
 */
export function useRenderedBlock(
  props: RuntimeProps,
  stateKey: StateKey | null,
  { source = 'content', policy }: InstanceOptions = {},
): RenderedBlockResult {
  const defRef: DefinitionRef | null = stateKey ? leafDefinitionKeyFromStateKey(stateKey) : null;

  const olxResult = useOlxJson(props, defRef, source);
  const translationState = useTranslation(props, olxResult.olxJson, source);
  const gateReady = useBlocksReadyForSources([source], props.runtime.blockRegistry);
  const renderedOnceRef = React.useRef(false);

  // The state gate covers the instance's whole closure (root + static
  // descendants) — its children must not write-from-empty either.
  const stateGate = useInstanceState(props, stateKey, { source, policy });

  if (!stateKey) {
    return { block: null, olxJson: undefined, ...blockData('ready') };
  }

  const stateObjection = stateGate.status === 'ready' ? null : stateGate;
  const depsReady = renderedOnceRef.current || gateReady;

  if (olxResult.loading || !depsReady || stateObjection?.loading) {
    return { block: <Spinner>{`Loading ${stateKey}...`}</Spinner>, ...blockData('loading') };
  }
  const error = olxResult.error
    ?? (stateObjection?.error ?? null)
    ?? (!olxResult.olxJson ? `Block "${stateKey}" not found in Redux` : null);
  if (error) {
    return {
      block: (
        <DisplayError
          id={`block-error-${stateKey}`}
          title="useRenderedBlock"
          message={error}
          data={{ stateKey, definitionKey: defRef }}
        />
      ),
      ...blockData('error', error),
    };
  }

  renderedOnceRef.current = true; // latch: never regress to the deps gate
  const rendered = render({ ...props, node: olxResult.olxJson });
  return {
    block: (
      <TranslatingIndicator translationState={translationState}>
        {rendered}
      </TranslatingIndicator>
    ),
    olxJson: olxResult.olxJson!,
    ...blockData('ready'),
  };
}

/**
 * The multi-instance form — variable N through ONE hook (hook-ordering:
 * a container cannot call useRenderedBlock in a loop). Same readiness
 * semantics per key; `blocks` is always the same length as `stateKeys`
 * and every entry is renderable (block, Spinner, or DisplayError).
 *
 * `olxJsons` is the same-length raw-content view (null while a key is
 * unresolved), for containers that read the definitions themselves —
 * e.g. a tab bar pulling `title` off each child's attributes — rather
 * than only rendering them.
 */
export function useRenderedBlockMulti(
  props: RuntimeProps,
  stateKeys: StateKey[],
  { source = 'content', policy }: InstanceOptions = {},
): { blocks: React.ReactNode[]; olxJsons: (OlxJson | null)[]; allReady: boolean } {
  interface KeyView {
    key: StateKey;
    olxJson: OlxJson | null;
    olxStatus: string;
    olxError?: string;
    /** Aggregate state-gate objection over the key's CLOSURE (root +
     * static descendants — selectInstanceStateKeys), or null if ready. */
    stateObjection: BlockDataResult | null;
    closureKeys: StateKey[];
  }
  const view: KeyView[] = useSelector(
    (state: any) => stateKeys.map((key): KeyView => {
      const defRef = leafDefinitionKeyFromStateKey(key);
      const olx = selectOlxJson(state, props, defRef, source);
      const closureKeys = selectInstanceStateKeys(state, props, key, source);
      let stateObjection: BlockDataResult | null = null;
      for (const closureKey of closureKeys) {
        const fresh = selectFieldFreshness(state, closureKey, { policy });
        const objection = stateBlockData(fresh, closureKey,
          fresh === 'failed' ? selectFieldAttempt(state, closureKey) : undefined);
        if (objection?.error) { stateObjection = objection; break; }
        stateObjection ??= objection;
      }
      return {
        key,
        olxJson: olx.olxJson,
        olxStatus: olx.status,
        olxError: olx.error ?? undefined,
        stateObjection,
        closureKeys,
      };
    }),
    (a, b) => a.length === b.length && a.every((av, i) => {
      const bv = b[i];
      return av.key === bv.key && av.olxJson === bv.olxJson
        && av.olxStatus === bv.olxStatus && av.olxError === bv.olxError
        && av.stateObjection?.status === bv.stateObjection?.status
        && av.stateObjection?.error === bv.stateObjection?.error
        && av.closureKeys.length === bv.closureKeys.length;
    }),
  );

  useEffect(() => {
    const allKeys = [...new Set(view.flatMap((v) => v.closureKeys))];
    if (allKeys.length > 0) ensureInstance(props, allKeys, { policy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.map((v) => `${v.closureKeys.join(',')}:${v.stateObjection?.status ?? 'ready'}`).join('|'),
      source, props.runtime.sideEffectFree]);

  let allReady = true;
  const blocks = view.map((v) => {
    const { stateObjection } = v;
    const error = v.olxError
      ?? stateObjection?.error
      ?? (v.olxStatus === 'ready' && !v.olxJson ? `Block "${v.key}" not found` : null);
    if (error) {
      allReady = false;
      return (
        <DisplayError
          id={`block-error-${v.key}`}
          title="useRenderedBlockMulti"
          message={error}
          data={{ stateKey: v.key }}
        />
      );
    }
    if (v.olxStatus !== 'ready' || !v.olxJson || stateObjection?.loading) {
      allReady = false;
      return <Spinner key={v.key}>{`Loading ${v.key}...`}</Spinner>;
    }
    return render({ ...props, node: v.olxJson });
  });

  return { blocks, olxJsons: view.map((v) => v.olxJson), allReady };
}

// ─── when= filtering ───────────────────────────────────────────────────────
//
// Three forms following the project convention:
//   selectKidsJson(props, reduxState) — pure selector (the logic)
//   useKidsJson(props)                — reactive hook wrapper
//   getKidsJson(props)                — one-shot imperative wrapper
//
// The pure forms live in staticDynamicDom.ts (blueprint-safe — no React, no render
// layer) so blueprint functions can import them without dragging this
// module's render-layer dependencies. Re-exported here for render-side
// callers; only the hook wrapper is defined in this file.

export { selectKidsJson, getKidsJson } from './staticDynamicDom';

/**
 * Hook that returns kids as OlxJson nodes with `when=` filtering applied.
 *
 * Use this (instead of props.kids) when you need structural access to
 * the kids list — e.g. for counting, navigation, tab bars. Blocks that
 * just render all children should use useKids() instead.
 */
// todo: selectKidsJson allocates a new array when when= conditions exist,
// so we need shallowEqual to avoid re-renders on unrelated dispatches.
// The old useKidsJson used useReferences (scoped subscription) + useMemo
// which avoided even running the filter. Revisit when we rearchitect the
// selector/use/get split — we need a pattern for hooks that post-process
// selector results (filter, map, derive) without losing subscription scoping.
export function useKidsJson(props: RuntimeProps): any[] {
  return useSelector((reduxState: any) => selectKidsJson(props, reduxState), shallowEqual);
}

// ─── Public hooks ───────────────────────────────────────────────────────────

/**
 * Hook for rendering kids in a component.
 *
 * SYNCHRONOUS: Renders all children immediately via renderCompiledKids.
 * This maintains the render tree for parent-child traversal (e.g., grader lookup).
 *
 * Evaluates `when=` expressions on children and filters out blocks whose
 * condition is false. This enables adaptive content — blocks that appear
 * or disappear based on runtime state.
 *
 * For async loading of dynamic content, use useRenderedBlock instead.
 */
export function useKids(props: any): { kids: React.ReactNode[] } {
  const filteredKids = useKidsJson(props);
  const kids = renderCompiledKids({ ...props, kids: filteredKids }) as React.ReactNode[];
  return { kids };
}
