// packages/shared/lib/docs/useDocsData.ts
//
// Shared hook for fetching block and grammar documentation.
// Used by both /docs page and Studio sidebar.
//
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getCategory, sortCategories } from './categoryUtils';
import type { AttributeDoc } from './schemaUtils';
import type { BlockGitStatus, OLXTag, ContentNamespace, FieldName } from '@/lib/types';

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
  // Branded to mirror LoBlock (name: OLXTag, fields keyed by FieldName) and the
  // ID grammar (namespace: ContentNamespace). These values originate from the
  // validated block registry, so they are valid by construction.
  name: OLXTag;
  description?: string | null;
  category?: string | null;
  source?: string;
  readme?: string | null;
  examples?: Record<string, { path: string; content?: string; gitStatus?: BlockGitStatus }>;
  gitStatus?: BlockGitStatus;
  readmeGitStatus?: BlockGitStatus;
  internal?: boolean;
  fields?: FieldName[];
  attributes?: AttributeDoc[] | null;
  namespace?: ContentNamespace;
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

/**
 * One example/include file with its loaded content. Returned by the block and
 * grammar *detail* endpoints (unlike BlockDoc.examples, content is populated).
 */
export interface ExampleDetail {
  path?: string;
  content: string;
  gitStatus?: BlockGitStatus | null;
}

/**
 * Detailed view of a single block — GET /api/docs/[block].
 * Richer than BlockDoc: readme and examples carry loaded file content.
 */
export interface BlockDetail {
  name: OLXTag;
  description?: string | null;
  namespace?: ContentNamespace;
  source?: string | null;
  fields?: FieldName[];
  hasAction?: boolean;
  hasParser?: boolean;
  template?: string | null;   // key into examples
  demo?: string | null;       // key into examples
  readme?: { path: string; content: string } | null;
  examples?: Record<string, ExampleDetail>;
  includes?: Record<string, ExampleDetail>;
}

/**
 * Detailed view of a single grammar — GET /api/docs/grammar/[name].
 *
 * Grammar identifiers (name, extension — e.g. "chatpeg") are lowercase and have
 * no branded type in the ID grammar yet; left as string pending grammar-type work.
 */
export interface GrammarDetail {
  name: string;
  extension?: string;
  source?: string;
  grammarDir?: string;
  description?: string | null;
  /** Grammar source text. */
  grammar?: string | null;
  /** Preview OLX wrapper. */
  preview?: string | null;
  examples?: Record<string, ExampleDetail>;
}

/** The `documentation` payload of GET /api/docs (block list). */
export interface BlockDocumentation {
  generated: string;
  totalBlocks: number;
  blocks: BlockDoc[];
}

/** The `documentation` payload of GET /api/docs/grammars (grammar list). */
export interface GrammarDocumentation {
  generated: string;
  totalGrammars: number;
  grammars: GrammarDoc[];
}

/** A documentation list item — either a block or a grammar. Lists and sidebars
 *  that show both (BlockList, the /docs sidebar) hold these. */
export type DocItem = BlockDoc | GrammarDoc;

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
