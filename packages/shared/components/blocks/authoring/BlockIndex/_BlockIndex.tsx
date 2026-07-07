'use client';
// packages/shared/components/blocks/authoring/BlockIndex/BlockIndex.tsx
//
// Renders the block listing: name (linked to its documentation page),
// description, category chips. Data via useDocs (get_blocks MCP).

import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import { useDocs } from '@/lib/docs/useDocs';
import Spinner from '@/components/common/Spinner';

/** Split a comma-separated attribute into trimmed non-empty entries. */
function csv(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

export default function BlockIndex(props: RuntimeProps) {
  // `match` OR-matches each entry against names and categories, so the two
  // attributes combine into one list.
  const filter = [...csv(props.categories), ...csv(props.blocks)];
  const { blocks, loading, error } = useDocs(filter.length ? { match: filter } : '*');

  if (error) return <div className="text-error text-sm p-2">Failed to load block index: {error}</div>;
  if (loading) return <Spinner>Loading block index…</Spinner>;
  if (blocks.length === 0) {
    return (
      <p className="text-dimmed py-2">
        No blocks match{filter.length ? ` ${filter.join(', ')}` : ''}.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 py-2">
      {blocks.map(block => (
        <li key={block.name} className="flex flex-col">
          <div className="flex items-baseline gap-2">
            <a href={`/docs/${block.name}`} className="font-medium text-foreground hover:text-accent">
              {block.name}
            </a>
            {block.categories.map(cat => (
              <span key={cat} className="lo-chip text-xs text-secondary">{cat}</span>
            ))}
          </div>
          {block.description && (
            <span className="text-sm text-secondary">{block.description}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
