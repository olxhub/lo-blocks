'use client';
// packages/shared/components/blocks/authoring/Studio/docsPanel.tsx
//
// Documentation sidebar panel. Ported from apps/web/app/studio/panels/
// DocsPanel.tsx, rebuilt on the MCP-backed docs layer. The block listing
// IS the BlockIndex block, embedded through the standard pipeline — the
// panel composes the same blocks /docs uses, so the two can't drift.

import { getContentType } from '@/lib/util/fileTypes';
import RenderOLX from '@/components/common/RenderOLX';
import { asStateKey } from '@/lib/types/id-grammar';
import { STUDIO_NS } from './studioNs';
import { ExpandableBlockDoc, CategorizedBlockList } from './blockDocsList';

export interface DocsPanelProps {
  filePath: string;
  content: string;
  /** Block tag enclosing the editor cursor — shows its attribute reference
   *  at the top of the panel (the DocAttributes block, embedded). */
  cursorTag?: string | null;
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

export function DocsPanel({ filePath, content, cursorTag, onInsert }: DocsPanelProps) {
  const docType = getContentType(filePath);
  const elements = extractElements(content);


  return (
    <div className="sidebar-panel docs-panel">
      <div className="sidebar-panel-header">Documentation</div>
      <div className="docs-list">
        <a href="/docs" target="_blank" className="docs-link">Full Documentation</a>

        {/* Context: attribute reference for the block at the cursor —
            the DocAttributes block, embedded (same source as /docs).
            Keyed per tag so each block's reference gets its own state.
            Safe to interpolate: cursorTag comes from enclosingBlockTag's
            [A-Za-z]\w* match — no quotes or angle brackets possible. */}
        {cursorTag && (
          <div className="docs-cursor-context">
            <div className="elements-in-file__header">
              At cursor: <a href={`/docs/${cursorTag}`} target="_blank" rel="noopener noreferrer">{cursorTag}</a>
            </div>
            <RenderOLX
              key={cursorTag}
              ns={STUDIO_NS}
              id={asStateKey('studio/docsPanelCursor')}
              inline={`<DocAttributes block="${cursorTag}"/>`}
              eventContext="studio"
            />
          </div>
        )}

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

        {/* Elements used in current file — expandable rows with template
            insert and Full docs links, same rows as the full list below. */}
        {elements.length > 0 && (
          <div className="elements-in-file">
            <div className="elements-in-file__header">Elements in file</div>
            <div className="elements-in-file__list">
              {elements.map(tag => (
                <ExpandableBlockDoc key={tag} name={tag} onInsert={onInsert} />
              ))}
            </div>
          </div>
        )}

        {/* All blocks, categorized — expandable rows with "+ Insert"
            (the majority authoring flow) and Full docs links. */}
        <CategorizedBlockList onInsert={onInsert} />
      </div>
    </div>
  );
}
