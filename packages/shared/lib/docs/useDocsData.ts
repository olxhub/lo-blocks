// packages/shared/lib/docs/useDocsData.ts
//
// Shared hook for fetching block and grammar documentation.
// Used by both /docs page and Studio sidebar.
//
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getCategory, sortCategories } from './categoryUtils';
import type { AttributeDoc } from './schemaUtils';
import type { BlockGitStatus } from '@/lib/types';

/**
 * Block documentation metadata — the display/API-layer representation of a
 * block. Used by /docs page and Studio sidebar via the legacy /api/docs route.
 *
 * TODO: Migrate /docs and Studio to use MCP get_blocks (tools.ts), then remove
 * this type and the /api/docs route. MCP's BlockResultSchema is the canonical
 * wire format going forward.
 *
 * This is the documentation subset of LoBlock: no component, reducers, parsers,
 * or other runtime fields. Grammar-related fields (_isGrammar, extension, etc.)
 * are included so the same type covers both blocks and grammars in combined lists.
 */
export interface BlockDoc {
  name: string;
  description?: string | null;
  category?: string | null;
  source?: string;
  readme?: string | null;
  examples?: Record<string, { path: string; content?: string; gitStatus?: BlockGitStatus }>;
  gitStatus?: BlockGitStatus;
  readmeGitStatus?: BlockGitStatus;
  internal?: boolean;
  fields?: string[];
  attributes?: AttributeDoc[] | null;
  namespace?: string;
  exportName?: string;
  /** PEG grammar extensions used by this block (e.g. ['chatpeg']) */
  grammars?: string[];
  // Grammar fields (present when _isGrammar is true)
  _isGrammar?: boolean;
  extension?: string;
  hasPreview?: boolean;
  exampleCount?: number;
}

export interface GrammarDoc {
  name: string;
  description?: string | null;
  extension?: string;
  source?: string;
  grammarDir?: string;
  hasPreview?: boolean;
  exampleCount?: number;
  _isGrammar?: boolean;
  category?: string;
}

export interface DocsData {
  blocks: BlockDoc[];
  grammars: GrammarDoc[];
  loading: boolean;
  error: string | null;
  // Combined list with grammars marked
  allItems: (BlockDoc | GrammarDoc)[];
  // Lookup by name
  blocksByName: Record<string, BlockDoc>;
  // Grouped by category
  categorized: Record<string, (BlockDoc | GrammarDoc)[]>;
  // Sorted category names
  categories: string[];
}

export function useDocsData(options: { showInternal?: boolean } = {}): DocsData {
  const { showInternal = false } = options;
  const [blocks, setBlocks] = useState<BlockDoc[]>([]);
  const [grammars, setGrammars] = useState<GrammarDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/docs').then(res => res.json()),
      fetch('/api/docs/grammars').then(res => res.json()),
    ])
      .then(([blocksData, grammarsData]) => {
        if (blocksData.ok) {
          setBlocks(blocksData.documentation.blocks);
        } else {
          setError(blocksData.error || 'Failed to load blocks');
        }
        if (grammarsData.ok) {
          // Mark grammars with _isGrammar flag and grammar category
          const markedGrammars = grammarsData.documentation.grammars.map((g: GrammarDoc) => ({
            ...g,
            _isGrammar: true,
            category: 'grammar',
          }));
          setGrammars(markedGrammars);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Filter internal blocks if needed
  const visibleBlocks = useMemo(() => {
    return showInternal ? blocks : blocks.filter(b => !b.internal);
  }, [blocks, showInternal]);

  // Combined list
  const allItems = useMemo(() => {
    return [...visibleBlocks, ...grammars];
  }, [visibleBlocks, grammars]);

  // Lookup by name
  const blocksByName = useMemo(() => {
    const lookup: Record<string, BlockDoc> = {};
    for (const block of blocks) {
      lookup[block.name] = block;
    }
    return lookup;
  }, [blocks]);

  // Group by category
  const categorized = useMemo(() => {
    const groups: Record<string, (BlockDoc | GrammarDoc)[]> = {};
    for (const item of allItems) {
      const category = getCategory(item);
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    }
    return groups;
  }, [allItems]);

  // Sorted category names
  const categories = useMemo(() => {
    return sortCategories(Object.keys(categorized));
  }, [categorized]);

  return {
    blocks,
    grammars,
    loading,
    error,
    allItems,
    blocksByName,
    categorized,
    categories,
  };
}
