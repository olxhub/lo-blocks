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
import type { OlxReference } from '@/lib/types';
import { refToOlxKey } from '@/lib/blocks/idResolver';

export interface RenderedBlockResult {
  block: React.ReactNode;
  ready: boolean;
  error: string | null;
}

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
  id: OlxReference | string | null,
  source: string = 'content'
): RenderedBlockResult {
  // Always call hooks unconditionally (React rules of hooks)
  const { olxJson: reduxOlxJson, loading, error } = useOlxJson(props, id, source);
  const translationState = useTranslation(props, reduxOlxJson, source);

  if (!id) {
    return { block: null, ready: true, error: null };
  }

  // Check Redux state
  if (loading) {
    return {
      block: <Spinner>{`Loading ${id}...`}</Spinner>,
      ready: false,
      error: null
    };
  }

  if (error) {
    return {
      block: (
        <DisplayError
          id={`block-error-${id}`}
          name="useBlock"
          message={error}
          data={{ blockId: id }}
        />
      ),
      ready: false,
      error
    };
  }

  if (!reduxOlxJson) {
    const olxKey = refToOlxKey(id);
    return {
      block: (
        <DisplayError
          id={`block-missing-${id}`}
          name="useBlock"
          message={`Block "${id}" not found in Redux`}
          data={{ blockId: id, olxKey }}
        />
      ),
      ready: false,
      error: `Block "${id}" not found`
    };
  }

  // Ready from Redux - render the block, wrapped with translation indicator
  const rendered = renderOlxJson({ ...props, node: reduxOlxJson });
  const block = (
    <TranslatingIndicator translationState={translationState}>
      {rendered}
    </TranslatingIndicator>
  );
  return { block, ready: true, error: null };
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
export function BlockRef({ id, ...props }: { id: string; [key: string]: any }) {
  const { block } = useBlock(props, id);
  return <>{block}</>;
}
