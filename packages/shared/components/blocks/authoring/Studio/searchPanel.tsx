'use client';
// packages/shared/components/blocks/authoring/Studio/searchPanel.tsx
//
// Ported from apps/web/app/studio/panels/SearchPanel.tsx.

import { useState } from 'react';
import type { OlxJson, LofsOrigin } from '@/lib/types';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import { useOlxJsonSourceIdMap } from '@/lib/state/olxjson';
import { source, addressPath } from '@/lib/types/address';

interface SearchPanelProps {
  content: string;
  currentPath: string;
  /** The selected source's origin (undefined until one is picked). Search is
   *  scoped to it (editing is single-source); cross-source search is deferred
   *  to the Studio redo. */
  currentSource: LofsOrigin | undefined;
  onFileSelect: (path: string) => void;
  onScrollToId?: (id: string) => void;
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

export function SearchPanel({ content, currentPath, currentSource, onFileSelect, onScrollToId }: SearchPanelProps) {
  // useState-ok: ephemeral inline-edit state — the panel's live search query.
  const [searchQuery, setSearchQuery] = useState('');
  const localIds = extractIds(content);
  // The compiled index, from its canonical home (the shell dispatched the
  // union fetch into the olxjson slice under 'content').
  const idMap = useOlxJsonSourceIdMap('content');

  // Filter idMap by search query, scoped to the selected source. The idMap is
  // the union across all sources, but editing is single-source — so results from
  // other sources would open the wrong file. (Cross-source search is a Studio-redo
  // UX decision.) IdMap is { [id]: { [variant]: OlxJson } } — unwrap to the OlxJson.
  const searchResults: Array<[string, OlxJson]> = searchQuery.trim() && currentSource
    ? Object.entries(idMap)
        .map(([id, variantMap]) => [id, extractLocalizedVariant(variantMap, '')] as [string, OlxJson | undefined])
        .filter((pair): pair is [string, OlxJson] => {
          const [id, entry] = pair;
          if (!entry) return false;
          // HACK: Skip blocks which aren't from accessible files (no provenance).
          // TODO: Figure out how to handle those (e.g. /docs/).
          if (!entry.source) return false;
          if (source(entry.source) !== currentSource) return false;
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
                // Scoped to currentSource, so the path is repo-relative within it.
                const relPath = String(addressPath(entry.source));
                const title = (entry.attributes.title as string) || id;
                return (
                  <div
                    key={id}
                    className="search-result-item clickable"
                    // BUG: Cross-file scroll-to-id is unreliable. onScrollToId fires
                    // before CodeMirror has rendered the new file's content, so it
                    // silently fails. Fixing properly requires deferred scroll-after-load
                    // logic, which should wait for a studio rearchitecture.
                    onClick={() => {
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
