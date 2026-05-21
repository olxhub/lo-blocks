// src/components/common/BlockList.tsx
//
// Shared block list component used by /docs page and Studio sidebar.
// Displays blocks grouped by category with collapsible sections.
//
'use client';

import { useState, useMemo, useEffect } from 'react';
import { getCategory, sortCategories } from '@/lib/docs';
import type { AttributeDoc, BlockDoc } from '@/lib/docs';
import ExpandIcon from '@/components/common/ExpandIcon';
import './BlockList.css';

interface DetailedDocs {
  readme?: { content: string };
  template?: string | null;  // Key into examples dict
  examples?: Record<string, { path: string; content: string }>;
  attributes?: AttributeDoc[] | null;
}

// =============================================================================
// ExpandableBlockDoc - Unified expandable block/element component
// =============================================================================

interface ExpandableBlockDocProps {
  name: string;
  block?: BlockDoc;
  onInsert?: (olx: string) => void;
  isGrammar?: boolean;
  extension?: string;
}

function ExpandableBlockDoc({ name, block, onInsert, isGrammar, extension }: ExpandableBlockDocProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailedDocs, setDetailedDocs] = useState<DetailedDocs | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Fetch detailed docs when expanded
  useEffect(() => {
    if (expanded && !detailedDocs && !loadingDocs) {
      setLoadingDocs(true);
      const endpoint = isGrammar
        ? `/api/docs/grammar/${encodeURIComponent(name)}`
        : `/api/docs/${encodeURIComponent(name)}`;
      fetch(endpoint)
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            const doc = isGrammar ? data.grammar : data.block;
            setDetailedDocs({
              readme: doc.readme,
              template: doc.template,
              examples: doc.examples,
              attributes: doc.attributes,
            });
          } else {
            setDetailedDocs({});  // prevent infinite refetch
          }
        })
        .catch((err) => {
          console.error(err);
          setDetailedDocs({});  // prevent infinite refetch
        })
        .finally(() => setLoadingDocs(false));
    }
  }, [expanded, name, isGrammar, detailedDocs, loadingDocs]);

  // Use attributes from detailed docs if available, fall back to block.attributes
  const attributes = detailedDocs?.attributes ?? block?.attributes;
  const customAttrs = attributes?.filter(attr => attr.description) || [];
  // BlockList is the Studio sidebar — always use template (bare block).
  // template is a key into examples dict; look up the content.
  const templateKey = detailedDocs?.template;
  const templateContent = (templateKey && detailedDocs?.examples?.[templateKey]?.content) ?? null;

  const handleInsert = () => {
    if (templateContent && onInsert) {
      onInsert(templateContent);
    }
  };

  return (
    <div className="expandable-block-item">
      <button className="expandable-block-item__header" onClick={() => setExpanded(!expanded)}>
        <span className="expandable-block-item__name">
          {name}
          {isGrammar && extension && (
            <span className="expandable-block-item__ext">.{extension}</span>
          )}
        </span>
        {block?.description && (
          <span className="expandable-block-item__desc">{block.description}</span>
        )}
        <span className="expandable-block-item__toggle"><ExpandIcon expanded={expanded} /></span>
      </button>
      {expanded && (
        <div className="expandable-block-item__content">
          {loadingDocs && <div className="expandable-block-item__loading">Loading...</div>}

          {/* Description */}
          {!loadingDocs && block?.description && (
            <div className="expandable-block-item__desc-full">{block.description}</div>
          )}

          {/* Attributes */}
          {customAttrs.length > 0 && (
            <div className="expandable-block-item__attrs">
              <div className="expandable-block-item__attrs-header">Attributes</div>
              <div className="expandable-block-item__attrs-list">
                {customAttrs.map(attr => (
                  <div key={attr.name} className="expandable-block-item__attr">
                    <code className="expandable-block-item__attr-name">{attr.name}</code>
                    {attr.enumValues ? (
                      <span className="expandable-block-item__attr-type">
                        {attr.enumValues.length <= 3
                          ? attr.enumValues.map(v => `"${v}"`).join('|')
                          : `${attr.enumValues.length} options`}
                      </span>
                    ) : (
                      <span className="expandable-block-item__attr-type">{attr.type}</span>
                    )}
                    {attr.description && (
                      <span className="expandable-block-item__attr-desc">{attr.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Template OLX */}
          {templateContent && (
            <div className="expandable-block-item__example-section">
              <div className="expandable-block-item__example-header">
                <span>Template</span>
                {onInsert && (
                  <button
                    className="expandable-block-item__insert-btn"
                    onClick={handleInsert}
                    title="Insert into editor"
                  >
                    + Insert
                  </button>
                )}
              </div>
              <pre className="expandable-block-item__example">{templateContent}</pre>
            </div>
          )}

          {/* Link to full docs */}
          <a
            href={`/docs#${name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="expandable-block-item__link"
          >
            Full docs →
          </a>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ElementsInFile - Shows elements used in the current file with expandable docs
// =============================================================================

interface ElementsInFileProps {
  elements: string[];
  blockDocs: Record<string, BlockDoc>;
  onInsert?: (olx: string) => void;
  className?: string;
}

export function ElementsInFile({ elements, blockDocs, onInsert, className = '' }: ElementsInFileProps) {
  if (elements.length === 0) return null;

  return (
    <div className={`elements-in-file ${className}`}>
      <div className="elements-in-file__header">Elements in file</div>
      <div className="elements-in-file__list">
        {elements.map(tag => (
          <ExpandableBlockDoc
            key={tag}
            name={tag}
            block={blockDocs[tag]}
            onInsert={onInsert}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// BlockList - Categorized list of all blocks
// =============================================================================

interface BlockListProps {
  blocks: BlockDoc[];
  selectedBlock?: string | null;
  onSelectBlock?: (name: string, isGrammar?: boolean) => void;
  onInsert?: (olx: string) => void;
  searchQuery?: string;
  showGitStatus?: boolean;
  className?: string;
}

export function BlockList({
  blocks,
  selectedBlock,
  onSelectBlock,
  onInsert,
  searchQuery = '',
  showGitStatus = false,
  className = '',
}: BlockListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    // Start with all categories collapsed
    const collapsed: Record<string, boolean> = {};
    blocks.forEach(block => {
      const cat = getCategory(block);
      collapsed[cat] = true;
    });
    return collapsed;
  });

  // Group blocks by category
  const categorizedBlocks = useMemo(() => {
    const groups: Record<string, BlockDoc[]> = {};
    blocks.forEach(block => {
      const category = getCategory(block);
      if (!groups[category]) groups[category] = [];
      groups[category].push(block);
    });
    return groups;
  }, [blocks]);

  // Filter by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categorizedBlocks;
    const query = searchQuery.toLowerCase();
    const filtered: Record<string, BlockDoc[]> = {};
    Object.entries(categorizedBlocks).forEach(([category, items]) => {
      const matching = items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        (item._isGrammar && item.extension?.toLowerCase().includes(query))
      );
      if (matching.length) filtered[category] = matching;
    });
    return filtered;
  }, [categorizedBlocks, searchQuery]);

  const sortedCategories = sortCategories(Object.keys(filteredCategories));

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className={`block-list ${className}`}>
      {sortedCategories.map(category => {
        const items = filteredCategories[category];
        const isCollapsed = collapsedCategories[category];

        return (
          <div key={category} className="block-list__category">
            <button
              className="block-list__category-header"
              onClick={() => toggleCategory(category)}
            >
              <span className="block-list__category-name">{category}</span>
              <span className="block-list__category-count">{items.length}</span>
              <span className="block-list__category-toggle"><ExpandIcon expanded={!isCollapsed} /></span>
            </button>

            {!isCollapsed && (
              <div className="block-list__items">
                {items.map(block => (
                  <ExpandableBlockDoc
                    key={block.name}
                    name={block.name}
                    block={block}
                    onInsert={onInsert}
                    isGrammar={block._isGrammar}
                    extension={block.extension}
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
