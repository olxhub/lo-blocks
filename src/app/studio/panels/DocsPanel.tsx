// src/app/studio/panels/DocsPanel.tsx
'use client';

import { ElementsInFile, BlockList } from '@/components/common/BlockList';
import type { DocsData } from '@/lib/docs';
import { getContentType } from '@/lib/util/fileTypes';

interface DocsPanelProps {
  filePath: string;
  content: string;
  docsData: DocsData;
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

export function DocsPanel({ filePath, content, docsData }: DocsPanelProps) {
  const docType = getContentType(filePath);
  const elements = extractElements(content);

  return (
    <div className="sidebar-panel docs-panel">
      <div className="sidebar-panel-header">Documentation</div>
      <div className="docs-list">
        <a href="/docs/" target="_blank" className="docs-link">Full Documentation</a>

        {/* File-type specific docs */}
        {/* TODO: Add general PEG syntax guide page. For now, link to specific grammars. */}
        {docType === 'peg' && (
          <div className="docs-section-links">
            <a href="/docs#Chat" target="_blank" className="docs-item">ChatPEG Format</a>
          </div>
        )}

        {docType === 'markdown' && (
          <div className="docs-section-links">
            <a href="/docs#Markdown" target="_blank" className="docs-item">Markdown Block</a>
          </div>
        )}

        {/* Elements used in current file */}
        <ElementsInFile elements={elements} blockDocs={docsData.blocksByName} />

        {/* All blocks and grammars by category */}
        {docsData.loading ? (
          <div className="search-hint">Loading blocks...</div>
        ) : (
          <BlockList blocks={docsData.allItems} />
        )}
      </div>
    </div>
  );
}
