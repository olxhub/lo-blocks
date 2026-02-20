// src/app/studio/panels/SearchPanel.tsx
'use client';

import { useState } from 'react';
import type { IdMap, OlxJson } from '@/lib/types';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';

interface SearchPanelProps {
  idMap: IdMap | null;
  content: string;
  currentPath: string;
  onFileSelect: (path: string) => void;
  onScrollToId?: (id: string) => void;
  onNotify?: (type: 'error' | 'info', message: string) => void;
}

// Extract IDs and their tag names from OLX content
function extractIds(content: string): Array<{ id: string; tag: string }> {
  const results: Array<{ id: string; tag: string }> = [];
  const regex = /<(\w+)[^>]*\bid=["']([^"']+)["'][^>]*>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({ tag: match[1], id: match[2] });
  }
  return results;
}

// Extract relative path from provenance
function getRelPath(prov?: string[]): string | null {
  if (!prov || prov.length === 0) return null;
  const idx = prov[0].indexOf('/content/');
  return idx >= 0 ? prov[0].slice(idx + '/content/'.length) : prov[0];
}

export function SearchPanel({ idMap, content, currentPath, onFileSelect, onScrollToId, onNotify }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const localIds = extractIds(content);

  // Filter idMap by search query
  // IdMap is { [id]: { [variant]: OlxJson } } — unwrap to get the OlxJson
  const searchResults: Array<[string, OlxJson]> = idMap && searchQuery.trim()
    ? Object.entries(idMap)
        .map(([id, variantMap]) => [id, extractLocalizedVariant(variantMap, '')] as [string, OlxJson | undefined])
        .filter((pair): pair is [string, OlxJson] => {
          const [id, entry] = pair;
          if (!entry) return false;
          const q = searchQuery.toLowerCase();
          const title = (entry.attributes.title as string) || '';
          return id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
        })
        .slice(0, 20)
    : [];

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">Search</div>
      <input
        type="text"
        className="search-input"
        placeholder="Search by ID or title..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Search results from idMap */}
      {searchQuery.trim() && (
        <>
          <div className="search-section">
            Results ({searchResults.length}{searchResults.length === 20 ? '+' : ''})
          </div>
          <div className="search-results">
            {searchResults.length === 0 ? (
              <div className="search-hint">No matching IDs found</div>
            ) : (
              searchResults.map(([id, entry]) => {
                const relPath = getRelPath(entry.provenance);
                const title = (entry.attributes.title as string) || id;
                return (
                  <div
                    key={id}
                    className="search-result-item clickable"
                    onClick={() => {
                      if (!relPath) {
                        onNotify?.('error', `No file provenance for ${id}`);
                        return;
                      }
                      if (relPath !== currentPath) {
                        onFileSelect(relPath);
                      }
                      onScrollToId?.(id);
                    }}
                  >
                    <div className="search-result-main">
                      <span className="search-id">{id}</span>
                      <span className="search-type">{entry.tag}</span>
                    </div>
                    {title !== id && (
                      <div className="search-result-title">{title}</div>
                    )}
                    {relPath && (
                      <div className="search-result-file">{relPath}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* IDs in current file */}
      <div className="search-section">IDs in current file ({localIds.length})</div>
      <div className="search-results">
        {localIds.length === 0 ? (
          <div className="search-hint">No IDs found in content</div>
        ) : (
          localIds.map(({ id, tag }) => (
            <div key={id} className="search-result-item">
              <span className="search-id">{id}</span>
              <span className="search-type">{tag}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
