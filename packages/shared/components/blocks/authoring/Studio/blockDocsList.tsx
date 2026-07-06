'use client';
// packages/shared/components/blocks/authoring/Studio/blockDocsList.tsx
//
// The docs panel's block listing — ported from components/common/
// BlockList.tsx (the legacy /docs + studio sidebar list) onto the
// MCP-backed docs layer. Two pieces:
//
//   ExpandableBlockDoc   one block row: name/description header that
//                        expands to compact attributes, the insert
//                        template with a "+ Insert" action (the majority
//                        authoring flow), and a Full docs link. Details
//                        fetch on first expand (useDocs facets).
//   CategorizedBlockList all blocks, grouped by category, collapsed by
//                        default.
//
// Styling reuses the legacy BlockList.css classes.

import React, { useState } from 'react';
import { useDocs } from '@/lib/docs/useDocs';
import { CATEGORY_ORDER } from '@/lib/docs/categoryUtils';
import type { BlockDocRecord } from '@/lib/types';
import type { AttributeDoc } from '@/lib/docs/schemaUtils';
import ExpandIcon from '@/components/common/ExpandIcon';
import '@/components/common/BlockList.css';

// ---------------------------------------------------------------------------
// One expandable block row
// ---------------------------------------------------------------------------

/** Detail body — its own component so the facet fetch happens only for
 *  expanded rows (hooks per component instance, not per list item). */
function BlockDocDetail({ name, description, onInsert }: {
  name: string;
  description: string | null;
  onInsert?: (olx: string) => void;
}) {
  const { blocks, loading } = useDocs([name], ['attributes', 'template']);
  const block = blocks.find(b => b.name === name);
  const attributes = ((block?.attributes ?? []) as AttributeDoc[])
    .filter(attr => attr.group === 'own' && attr.description);
  const template = block?.template ?? null;

  return (
    <div className="expandable-block-item__content">
      {loading && <div className="expandable-block-item__loading">Loading...</div>}

      {!loading && description && (
        <div className="expandable-block-item__desc-full">{description}</div>
      )}

      {attributes.length > 0 && (
        <div className="expandable-block-item__attrs">
          <div className="expandable-block-item__attrs-header">Attributes</div>
          <div className="expandable-block-item__attrs-list">
            {attributes.map(attr => (
              <div key={attr.name} className="expandable-block-item__attr">
                <code className="expandable-block-item__attr-name">{attr.name}</code>
                <span className="expandable-block-item__attr-type">
                  {attr.enumValues
                    ? (attr.enumValues.length <= 3
                        ? attr.enumValues.map(v => `"${v}"`).join('|')
                        : `${attr.enumValues.length} options`)
                    : attr.type}
                </span>
                {attr.description && (
                  <span className="expandable-block-item__attr-desc">{attr.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {template && (
        <div className="expandable-block-item__example-section">
          <div className="expandable-block-item__example-header">
            <span>Template</span>
            {onInsert && (
              <button
                className="expandable-block-item__insert-btn"
                onClick={() => onInsert(template)}
                title="Insert into editor"
              >
                + Insert
              </button>
            )}
          </div>
          <pre className="expandable-block-item__example">{template}</pre>
        </div>
      )}

      <a
        href={`/docs/${name}`}
        target="_blank"
        rel="noopener noreferrer"
        className="expandable-block-item__link"
      >
        Full docs →
      </a>
    </div>
  );
}

export function ExpandableBlockDoc({ name, description, onInsert }: {
  name: string;
  description?: string | null;
  onInsert?: (olx: string) => void;
}) {
  // useState-ok: ephemeral row-expansion state.
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="expandable-block-item">
      <button className="expandable-block-item__header" onClick={() => setExpanded(!expanded)}>
        <span className="expandable-block-item__name">{name}</span>
        {description && (
          <span className="expandable-block-item__desc">{description}</span>
        )}
        <span className="expandable-block-item__toggle"><ExpandIcon expanded={expanded} /></span>
      </button>
      {expanded && (
        <BlockDocDetail name={name} description={description ?? null} onInsert={onInsert} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All blocks, categorized (collapsed by default)
// ---------------------------------------------------------------------------

export function CategorizedBlockList({ onInsert }: { onInsert?: (olx: string) => void }) {
  const { blocks, loading } = useDocs('*');
  // useState-ok: ephemeral per-category expansion (legacy behavior:
  // everything starts collapsed).
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  if (loading) return <div className="search-hint">Loading blocks...</div>;

  const grouped: Record<string, BlockDocRecord[]> = {};
  for (const b of blocks) {
    const category = b.categories[0] ?? 'Other';
    (grouped[category] ??= []).push(b);
  }
  const ordered = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)).sort(),
  ];

  return (
    <div className="block-list">
      {ordered.map(category => {
        const items = grouped[category];
        const expanded = !!expandedCategories[category];
        return (
          <div key={category} className="block-list__category">
            <button
              className="block-list__category-header"
              onClick={() => setExpandedCategories({ ...expandedCategories, [category]: !expanded })}
            >
              <span className="block-list__category-name">{category}</span>
              <span className="block-list__category-count">{items.length}</span>
              <span className="block-list__category-toggle"><ExpandIcon expanded={expanded} /></span>
            </button>
            {expanded && (
              <div className="block-list__items">
                {items.map(block => (
                  <ExpandableBlockDoc
                    key={block.name}
                    name={block.name}
                    description={block.description}
                    onInsert={onInsert}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
