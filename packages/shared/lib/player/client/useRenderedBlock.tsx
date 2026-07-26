// packages/shared/lib/player/client/useRenderedBlock.tsx
//
// Hooks for rendering OLX blocks to React elements.
//
// Two modes:
// - useKids: Synchronous rendering via renderCompiledKids (for normal use)
// - useBlock: Can trigger async load for dynamic references
//
// The key insight: initial render is synchronous. Content is already in Redux
// (or idMap for legacy). Async loading is only for dynamic content loaded later.
//
// useKids also evaluates `when=` expressions on children, filtering out
// blocks whose condition is false. This enables adaptive content.
//
'use client';

import React from 'react';
import { useSelector } from 'react-redux';
import { isEqual } from 'lodash-es';
import { useOlxJson, useOlxJsonMultiple, getOlxJsonMultiple } from '@/lib/player/client/useOlxJson';
import { useBlocksReadyForSources } from '@/lib/player/client/useBlocksReady';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { render, renderCompiledKids } from '@/lib/player/client/render';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';
import TranslatingIndicator from '@/lib/i18n/TranslatingIndicator';
import type { DefinitionRef, StateKey, BlockDataResult, OlxJson, RuntimeProps } from '@/lib/types';
import { blockData } from '@/lib/state/redux';
import { leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import { selectKidsJson } from '../../blocks/staticDynamicDom';

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
export function useBlock(
  props: any,
  stateKey: StateKey | null,
  source: string = 'content'
): RenderedBlockResult {
  const defRef: DefinitionRef | null = stateKey
    ? leafDefinitionKeyFromStateKey(stateKey)
    : null;

  // Always call hooks unconditionally (React rules of hooks)
  const olxResult = useOlxJson(props, defRef, source);
  const { olxJson: reduxOlxJson } = olxResult;
  const translationState = useTranslation(props, reduxOlxJson, source);
  // Block readiness (lazy engines + component chunks) rides along with OLX
  // loading — every useBlock consumer gets both for free. See
  // useBlocksReady for scope and failure semantics.
  //
  // LATCHED per instance: the gate holds only the FIRST content render
  // (cold-start correctness — engines before anything evaluates). Once this
  // instance has rendered, later content arriving in the source (an editor
  // insert, a sibling pane's fetch) must not re-suspend it — a cold chunk
  // then falls to LazyBlock's own spinner for just the new block.
  const gateReady = useBlocksReadyForSources([source], props.runtime.blockRegistry);
  const renderedOnceRef = React.useRef(false);
  const depsReady = renderedOnceRef.current || gateReady;

  if (!stateKey) {
    return { block: null, olxJson: undefined, ...blockData('ready') };
  }

  // Check Redux state
  if (olxResult.loading || !depsReady) {
    return {
      block: <Spinner>{`Loading ${stateKey}...`}</Spinner>,
      ...blockData('loading')
    };
  }

  if (olxResult.error) {
    return {
      block: (
        <DisplayError
          id={`block-error-${stateKey}`}
          title={`Couldn't load content for "${stateKey}"`}
          message={olxResult.error}
          data={{ stateKey, source }}
        />
      ),
      ...blockData('error', olxResult.error)
    };
  }

  if (!reduxOlxJson) {
    const msg =
      `Block "${stateKey}" isn't in the "${source}" content store, and no ` +
      `fetch has resolved it. Inline/parsed content should already be in Redux ` +
      `by the time it renders — if you see this, its dispatch hasn't landed yet.`;
    return {
      block: (
        <DisplayError
          id={`block-missing-${stateKey}`}
          title={`Content missing for "${stateKey}"`}
          message={msg}
          data={{ stateKey, definitionKey: defRef, source }}
        />
      ),
      ...blockData('error', msg)
    };
  }

  // Ready from Redux - render the block, wrapped with translation indicator
  renderedOnceRef.current = true;  // latch: never regress to the deps gate
  const rendered = render({ ...props, node: reduxOlxJson });
  const block = (
    <TranslatingIndicator translationState={translationState}>
      {rendered}
    </TranslatingIndicator>
  );
  return { block, olxJson: reduxOlxJson, ...blockData('ready') };
}

// ─── Rendered blocks from ID lists ─────────────────────────────────────────
//
// Hook and getter for rendering multiple blocks from an array of IDs.
// Fills the gap between useKids (for kids lists) and useBlock (single ID).
//

/**
 * Hook for rendering multiple blocks from an array of IDs.
 *
 * Takes an array of DefinitionRef IDs and returns rendered React elements.
 * Each block is fetched via useOlxJsonMultiple and rendered via render().
 * Placeholders (Spinner/ErrorNode) are automatically returned for loading/error states
 * by useOlxJsonMultiple's contract.
 *
 * This is the missing piece: useKids handles kids lists, useBlock handles
 * single IDs, and this handles ID lists.
 *
 * @param props - Component props (runtime, nodeInfo, etc.)
 * @param ids - Array of OLX IDs to render
 * @param source - Content source (default: 'content')
 */
export function useRenderedBlocksMultiple(
  props: RuntimeProps,
  ids: DefinitionRef[],
  source: string = 'content'
): {
  blocks: React.ReactNode[];
  allReady: boolean;
} {
  const { olxJsons, allReady } = useOlxJsonMultiple(props, ids, source);

  // useOlxJsonMultiple guarantees non-null entries (Spinner/ErrorNode OlxJson for loading/error)
  // Just render each one through the normal block pipeline
  const blocks = olxJsons.map(olxJson => render({ ...props, node: olxJson }));

  return { blocks, allReady };
}

/**
 * One-shot imperative form: renders multiple blocks from IDs.
 *
 * Use in callbacks or non-reactive contexts. Not for regular use —
 * prefer useRenderedBlocksMultiple in components.
 */
export function getRenderedBlocksMultiple(
  props: RuntimeProps,
  ids: DefinitionRef[],
  source: string = 'content'
): {
  blocks: React.ReactNode[];
  allReady: boolean;
} {
  const { olxJsons, allReady } = getOlxJsonMultiple(props, ids, source);
  const blocks = olxJsons.map(olxJson => render({ ...props, node: olxJson }));
  return { blocks, allReady };
}

// ─── when= filtering ───────────────────────────────────────────────────────
//
// Three forms following the project convention:
//   selectKidsJson(props, reduxState) — pure selector (the logic)
//   useKidsJson(props)                — reactive hook wrapper
//   getKidsJson(props)                — one-shot imperative wrapper
//
// The pure forms live in olxdom.ts (blueprint-safe — no React, no render
// layer) so blueprint functions can import them without dragging this
// module's render-layer dependencies. Re-exported here for render-side
// callers; only the hook wrapper is defined in this file.

export { selectKidsJson, getKidsJson } from '../../blocks/staticDynamicDom';

/**
 * Hook that returns kids as OlxJson nodes with `when=` filtering applied.
 *
 * Use this (instead of props.kids) when you need structural access to
 * the kids list — e.g. for counting, navigation, tab bars. Blocks that
 * just render all children should use useKids() instead.
 */
// todo: selectKidsJson allocates new arrays when when= conditions exist,
// so we need structural equality to avoid re-renders on unrelated dispatches.
// The old useKidsJson used useReferences (scoped subscription) + useMemo
// which avoided even running the filter. Revisit when we rearchitect the
// selector/use/get split — we need a pattern for hooks that post-process
// selector results (filter, map, derive) without losing subscription scoping.
export function useKidsJson(props: RuntimeProps): any[] {
  return useSelector((reduxState: any) => selectKidsJson(props, reduxState), isEqual);
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
 * For async loading of dynamic content, use useBlock instead.
 */
export function useKids(props: any): { kids: React.ReactNode[] } {
  const filteredKids = useKidsJson(props);
  const kids = renderCompiledKids({ ...props, kids: filteredKids }) as React.ReactNode[];
  return { kids };
}

/**
 * Hook for rendering kids with explicit loading/error state.
 *
 * Use when you need to know if all dynamic kid blocks are loaded.
 * Note: This checks Redux state, not the render tree.
 */
export function useKidsWithState(props: any): {
  kids: React.ReactNode[];
  ready: boolean;
  error: string | null;
} {
  const filteredKids = useKidsJson(props);
  const kids = renderCompiledKids({ ...props, kids: filteredKids }) as React.ReactNode[];
  return { kids, ready: true, error: null };
}

/**
 * Component for rendering a block reference with async loading.
 * Used for dynamic content that may not be pre-loaded.
 */
export function BlockRef({ id, ...props }: { id: StateKey; [key: string]: any }) {
  const { block } = useBlock(props, id);
  return <>{block}</>;
}
