'use client';
// packages/shared/components/blocks/authoring/BlockDoc/_BlockDoc.tsx
//
// Renders one block's full documentation: header (name, category chips,
// description), attributes table, README, and examples. Data via
// useBlockDocs (get_blocks MCP), with 'readme', 'examples', 'attributes'
// include levels — heavier than BlockIndex's descriptor-only listing.

import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import { useBlockDocs } from '@/lib/docs/useBlockDocs';
import { asContentNamespace } from '@/lib/types/id-grammar';
import Spinner from '@/components/common/Spinner';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import { OLXCodeBlock } from '@/components/common/OLXCodeBlock';
import type { AttributeDoc } from '@/lib/docs/schemaUtils';

export default function _BlockDoc(props: RuntimeProps) {
  const name = props.block;
  const validName = typeof name === 'string' && name.length > 0;

  // Hooks run unconditionally (rules of hooks) — the invalid-name guard
  // renders below. Zod already rejects a missing block= at OLX parse time;
  // this path only exists for direct React usage.
  const { blocks, loading, error } = useBlockDocs(
    [validName ? name : ''], ['readme', 'examples', 'attributes']);

  if (!validName) {
    return <div className="text-error text-sm p-2">BlockDoc requires a block= attribute naming the block to document.</div>;
  }
  if (error) return <div className="text-error text-sm p-2">Failed to load block documentation: {error}</div>;
  if (loading) return <Spinner>Loading block documentation…</Spinner>;

  // get_blocks matching is fuzzy/normalized (can match categories too),
  // so pick the exact record by name locally.
  const block = blocks.find(b => b.name === name);

  if (!block) {
    return <p className="text-dimmed py-2">No documentation found for {name}.</p>;
  }

  const ns = asContentNamespace(`docs.${block.name}`);
  const attributes = (block.attributes as AttributeDoc[] | null | undefined);
  const examples = Object.entries(block.examples ?? {})
    .filter(([filename]) => !filename.endsWith('.includes.olx'));

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <h2 className="font-medium text-foreground text-lg">{block.name}</h2>
          {block.categories.map(cat => (
            <span key={cat} className="lo-chip text-xs text-secondary">{cat}</span>
          ))}
        </div>
        {block.description && (
          <span className="text-sm text-secondary">{block.description}</span>
        )}
      </div>

      {attributes && attributes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Required</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {attributes.map(attr => (
              <tr key={attr.name}>
                <td>{attr.name}</td>
                <td>{attr.enumValues?.length ? attr.enumValues.join(' | ') : attr.type}</td>
                <td>{attr.required ? 'yes' : 'no'}</td>
                <td>
                  {attr.description}
                  {attr.default !== undefined && ` (default: ${JSON.stringify(attr.default)})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {block.readme && (
        <RenderMarkdown ns={ns}>{block.readme.content}</RenderMarkdown>
      )}

      {examples.length > 0 && (
        <div className="flex flex-col gap-3">
          {examples.map(([filename, example]) => (
            <div key={filename} className="flex flex-col gap-1">
              <span className="text-xs text-dimmed">{filename}</span>
              <OLXCodeBlock language="olx:playground" ns={ns}>{example.content}</OLXCodeBlock>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
