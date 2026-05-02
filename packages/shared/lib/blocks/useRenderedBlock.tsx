// src/lib/blocks/useRenderedBlock.tsx
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
import { useSelector, shallowEqual } from 'react-redux';
import { useOlxJson } from '@/lib/blocks/useOlxJson';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderOlxJson, renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';
import TranslatingIndicator from '@/lib/i18n/TranslatingIndicator';
import type { OlxReference, BlockDataResult, OlxJson, RuntimeProps } from '@/lib/types';
import { blockData } from '@/lib/state/redux';
import { refToOlxKey } from '@/lib/types/id';
import { selectBlock } from '@/lib/state/olxjson';
import {
  evaluate, createContext,
  extractStructuredRefs, mergeReferences, EMPTY_REFS,
  selectReferences,
} from '@/lib/stateLanguage';

export type RenderedBlockResult = BlockDataResult & {
  block: React.ReactNode;
  // TODO: Always return an OlxJson (e.g. { tag: 'Spinner', ... } or { tag: 'DisplayError', ... })
  // so callers never need null checks. For now, absent during loading/error.
  olxJson?: OlxJson;
};

/**
 * Hook to render a block by OLX ID.
 *
 * Reads block data from Redux via useOlxJson. If not found, triggers a fetch.
 * Returns { block, ready, error } for handling loading/error states.
 *
 * @param props - Component props (nodeInfo, blockRegistry, olxJsonSources, etc.)
 * @param id - The OLX ID to render
 * @param source - Content source for Redux lookup (default: 'content')
 */
export function useBlock(
  props: any,
  id: OlxReference | null,
  source: string = 'content'
): RenderedBlockResult {
  // Always call hooks unconditionally (React rules of hooks)
  const olxResult = useOlxJson(props, id, source);
  const { olxJson: reduxOlxJson } = olxResult;
  const translationState = useTranslation(props, reduxOlxJson, source);

  if (!id) {
    return { block: null, olxJson: undefined, ...blockData('ready') };
  }

  // Check Redux state
  if (olxResult.loading) {
    return {
      block: <Spinner>{`Loading ${id}...`}</Spinner>,
      ...blockData('loading')
    };
  }

  if (olxResult.error) {
    return {
      block: (
        <DisplayError
          id={`block-error-${id}`}
          name="useBlock"
          message={olxResult.error}
          data={{ blockId: id }}
        />
      ),
      ...blockData('error', olxResult.error)
    };
  }

  if (!reduxOlxJson) {
    const olxKey = refToOlxKey(id);
    const msg = `Block "${id}" not found in Redux`;
    return {
      block: (
        <DisplayError
          id={`block-missing-${id}`}
          name="useBlock"
          message={msg}
          data={{ blockId: id, olxKey }}
        />
      ),
      ...blockData('error', msg)
    };
  }

  // Ready from Redux - render the block, wrapped with translation indicator
  const rendered = renderOlxJson({ ...props, node: reduxOlxJson });
  const block = (
    <TranslatingIndicator translationState={translationState}>
      {rendered}
    </TranslatingIndicator>
  );
  return { block, olxJson: reduxOlxJson, ...blockData('ready') };
}

// ─── when= filtering ───────────────────────────────────────────────────────
//
// Three forms following the project convention:
//   selectKidsJson(props, reduxState) — pure selector (the logic)
//   useKidsJson(props)                — reactive hook wrapper
//   getKidsJson(props)                — one-shot imperative wrapper
//
// Collects `when` expressions from kid blocks, resolves their
// dependencies, evaluates each, and filters out kids whose condition
// is false.

// Returns the pre-parsed { expr, ast } from the when= attribute, or undefined.
function getWhen(kid, props) {
  if (kid.type === 'block') {
    const olxKey = refToOlxKey(kid.id);
    const state = props.runtime.store.getState();
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const block = selectBlock(state, sources, olxKey, props.runtime.locale.code);
    if (!block) return undefined;  // not yet loaded — show by default
    return block.attributes.when;
  }
  if (kid.tag) {
    return kid.attributes.when;
  }
  return undefined;
}

function collectWhens(kids, props) {
  const map = {};
  for (const kid of kids) {
    const when = getWhen(kid, props);
    if (!when) continue;
    map[kid.id] = when;
  }
  return map;
}

/**
 * Pure selector: returns kids as OlxJson nodes with `when=` filtering applied.
 *
 * Use in blueprint functions (advance, canAdvance, actions) where hooks
 * are unavailable.  Composable — wrap with `.length` for kid count, etc.
 */
export function selectKidsJson(props: RuntimeProps, reduxState: any): any[] {
  const rawKids = (props.kids || []) as any[];
  const whenMap = collectWhens(rawKids, props);
  if (Object.keys(whenMap).length === 0) return rawKids;

  const allRefs = (() => {
    const entries = Object.values(whenMap) as { expr: string }[];
    if (entries.length === 0) return EMPTY_REFS;
    return mergeReferences(...entries.map(w => extractStructuredRefs(w.expr)));
  })();

  const resolved = selectReferences(reduxState, props, allRefs);
  const ctx = createContext(resolved);
  return rawKids.filter(kid => {
    const when = whenMap[kid.id];
    if (!when) return true;
    return Boolean(evaluate(when.ast, ctx));
  });
}

/** One-shot imperative form: grabs current state and calls selectKidsJson. */
export function getKidsJson(props: RuntimeProps): any[] {
  return selectKidsJson(props, props.runtime.store.getState());
}

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
export function BlockRef({ id, ...props }: { id: OlxReference; [key: string]: any }) {
  const { block } = useBlock(props, id);
  return <>{block}</>;
}
