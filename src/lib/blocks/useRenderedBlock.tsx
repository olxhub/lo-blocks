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
'use client';

import React from 'react';
import { useOlxJson } from '@/lib/blocks/useOlxJson';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderOlxJson, renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';
import TranslatingIndicator from '@/lib/i18n/TranslatingIndicator';
import type { OlxReference, BlockDataResult } from '@/lib/types';
import { blockData } from '@/lib/state/redux';
import { refToOlxKey } from '@/lib/blocks/idResolver';

export type RenderedBlockResult = BlockDataResult & {
  block: React.ReactNode;
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
    return { block: null, ...blockData('ready') };
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
  return { block, ...blockData('ready') };
}

/**
 * Hook for rendering kids in a component.
 *
 * SYNCHRONOUS: Renders all children immediately via renderCompiledKids.
 * This maintains the render tree for parent-child traversal (e.g., grader lookup).
 *
 * For async loading of dynamic content, use useBlock instead.
 */
export function useKids(props: any): { kids: React.ReactNode[] } {
  // Synchronous render - maintains nodeInfo.renderedKids tree
  const kids = renderCompiledKids(props) as React.ReactNode[];
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
  // For now, just render synchronously
  // TODO: Add proper loading state tracking if needed
  const kids = renderCompiledKids(props) as React.ReactNode[];
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
