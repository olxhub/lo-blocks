'use client';
// packages/shared/components/blocks/authoring/Studio/docsPanel.tsx
//
// Documentation sidebar panel. Ported from apps/web/app/studio/panels/
// DocsPanel.tsx, rebuilt on the MCP-backed docs layer (useDocs) instead of
// the retired /api/docs REST routes (useDocsData/BlockList).

import { useDocs } from '@/lib/docs/useDocs';
import { getContentType } from '@/lib/util/fileTypes';

export interface DocsPanelProps {
  filePath: string;
  content: string;
  onInsert?: (olx: string) => void;
}

// Extract unique element tags used in content
// TODO: Should we use XML parse results or parsed OLX DOM instead of regex?
function extractElements(content: string): string[] {
  const tags = new Set<string>();
  const regex = /<([A-Z]\w*)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.add(match[1]);
  }
  return Array.from(tags).sort();
}

export function DocsPanel({ filePath, content, onInsert }: DocsPanelProps) {
  const docType = getContentType(filePath);
  const elements = extractElements(content);

  // Full listing (descriptor level: name + description).
  const { blocks: allBlocks, loading } = useDocs('*');
  // Elements used in the file, with their insert templates.
  const { blocks: elementBlocks } = useDocs(elements, ['template']);
  const templateFor = (name: string): string | null =>
    elementBlocks.find(b => b.name === name)?.template ?? null;

  return (
    <div className="sidebar-panel docs-panel">
      <div className="sidebar-panel-header">Documentation</div>
      <div className="docs-list">
        <a href="/docs" target="_blank" className="docs-link">Full Documentation</a>

        {/* File-type specific docs */}
        {/* TODO: Add general PEG syntax guide page. For now, link to specific grammars. */}
        {docType === 'peg' && (
          <div className="docs-section-links">
            <a href="/docs/Chat" target="_blank" className="docs-item">ChatPEG Format</a>
          </div>
        )}

        {docType === 'markdown' && (
          <div className="docs-section-links">
            <a href="/docs/Markdown" target="_blank" className="docs-item">Markdown Block</a>
          </div>
        )}

        {/* Elements used in current file */}
        {elements.length > 0 && (
          <div className="elements-in-file">
            <div className="elements-in-file__header">Elements in file</div>
            <div className="elements-in-file__list">
              {elements.map(tag => {
                const template = templateFor(tag);
                return (
                  <button
                    key={tag}
                    className="docs-item"
                    title={template ? 'Insert template into editor' : 'Insert into editor'}
                    onClick={() => onInsert?.(template ?? `<${tag}></${tag}>`)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* All blocks (name + description, linking to full docs) */}
        {loading ? (
          <div className="search-hint">Loading blocks...</div>
        ) : (
          <div className="docs-blocks">
            {allBlocks.map(block => (
              <a
                key={block.name}
                href={`/docs/${block.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="docs-item"
              >
                <span className="docs-item-name">{block.name}</span>
                {block.description && (
                  <span className="docs-item-desc">{block.description}</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
