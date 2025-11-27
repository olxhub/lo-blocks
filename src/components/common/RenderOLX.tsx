// src/components/common/RenderOLX.tsx
//
// Generic component for rendering OLX content from various sources.
//
// This component abstracts the OLX parsing and rendering pipeline,
// allowing content to come from inline strings, virtual filesystems,
// or storage providers. It's designed to be used in preview pages,
// editors, documentation, and anywhere OLX needs to be rendered.
//
// Usage examples:
//
//   // Simple inline OLX
//   <RenderOLX id="demo" inline="<Markdown>Hello world</Markdown>" />
//
//   // Multiple files (for content with src="" references)
//   <RenderOLX
//     id="ChatDemo"
//     files={{
//       'chat.olx': '<Chat src="convo.chatpeg" />',
//       'convo.chatpeg': 'User: Hi\nAssistant: Hello!'
//     }}
//   />
//
//   // With a storage provider
//   <RenderOLX id="MyPage" provider={networkProvider} />
//
//   // With provider stack (tries each in order)
//   <RenderOLX id="MyPage" providers={[reduxOverlay, networkProvider]} />
//
'use client';

import { useState, useEffect, useMemo } from 'react';
import { parseOLX } from '@/lib/content/parseOLX';
import { render, makeRootNode } from '@/lib/render';
import { COMPONENT_MAP } from '@/components/componentMap';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import type { StorageProvider } from '@/lib/storage';
import type { IdMap } from '@/lib/types';

// In-memory provider for inline content and virtual filesystems
class InMemoryStorageProvider implements StorageProvider {
  private files: Record<string, string>;
  private basePath: string;

  constructor(files: Record<string, string>, basePath: string = '') {
    this.files = files;
    this.basePath = basePath;
  }

  async read(path: string): Promise<string> {
    // Normalize path - remove leading ./ or /
    const normalized = path.replace(/^\.?\//, '');

    if (this.files[normalized] !== undefined) {
      return this.files[normalized];
    }

    // Try with basePath prefix
    const withBase = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    if (this.files[withBase] !== undefined) {
      return this.files[withBase];
    }

    throw new Error(`File not found: ${path}`);
  }

  async exists(path: string): Promise<boolean> {
    const normalized = path.replace(/^\.?\//, '');
    return this.files[normalized] !== undefined;
  }

  // Required by StorageProvider interface but not needed for read-only use
  async write(_path: string, _content: string): Promise<void> {
    throw new Error('InMemoryStorageProvider is read-only');
  }

  async list(_path?: string): Promise<string[]> {
    return Object.keys(this.files);
  }

  async loadXmlFilesWithStats(_existing: Record<string, any>): Promise<any> {
    throw new Error('Not implemented for InMemoryStorageProvider');
  }
}

export interface RenderOLXProps {
  /** Root node ID to render */
  id: string;

  // Content sources (use one):
  /** Single OLX string for simple inline content */
  inline?: string;
  /** Virtual filesystem for multi-file content (e.g., OLX with src="" refs) */
  files?: Record<string, string>;
  /** Single storage provider */
  provider?: StorageProvider;
  /** Stack of providers (tries each in order until content found) */
  providers?: StorageProvider[];

  // Optional:
  /** Base idMap for cross-references to external content */
  baseIdMap?: IdMap;
  /** Provider for resolving src="" references (used with inline or files) */
  resolveProvider?: StorageProvider;
  /** Provenance URI for error reporting and relative path resolution */
  provenance?: string;
  /** Error handler callback */
  onError?: (error: Error) => void;
  /** Custom component map (defaults to global COMPONENT_MAP) */
  componentMap?: typeof COMPONENT_MAP;
}

type ParsedContent = {
  root: string;
  ids: string[];
  idMap: IdMap;
};

export default function RenderOLX({
  id,
  inline,
  files,
  provider,
  providers,
  baseIdMap,
  resolveProvider,
  provenance,
  onError,
  componentMap = COMPONENT_MAP,
}: RenderOLXProps) {
  const [parsed, setParsed] = useState<ParsedContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Validate props and create effective provider
  const { effectiveProvider, validationError, renderFromBaseOnly } = useMemo(() => {
    const contentSources = [inline, files, provider, providers].filter(Boolean);

    // Special case: if only baseIdMap is provided, render directly from it
    if (contentSources.length === 0 && baseIdMap) {
      return {
        effectiveProvider: null,
        validationError: null,
        renderFromBaseOnly: true
      };
    }

    if (contentSources.length === 0) {
      return {
        effectiveProvider: null,
        validationError: 'RenderOLX: No content source provided (need inline, files, provider, providers, or baseIdMap)',
        renderFromBaseOnly: false
      };
    }

    if (contentSources.length > 1) {
      return {
        effectiveProvider: null,
        validationError: 'RenderOLX: Multiple content sources provided (use only one of inline, files, provider, providers)',
        renderFromBaseOnly: false
      };
    }

    if (inline) {
      // Use resolveProvider if given, otherwise fall back to InMemoryStorageProvider
      return {
        effectiveProvider: resolveProvider || new InMemoryStorageProvider({ '_inline.olx': inline }),
        validationError: null,
        renderFromBaseOnly: false
      };
    }

    if (files) {
      // Use resolveProvider if given, otherwise fall back to InMemoryStorageProvider
      return {
        effectiveProvider: resolveProvider || new InMemoryStorageProvider(files),
        validationError: null,
        renderFromBaseOnly: false
      };
    }

    if (provider) {
      return {
        effectiveProvider: provider,
        validationError: null,
        renderFromBaseOnly: false
      };
    }

    if (providers) {
      // TODO: Implement StackedStorageProvider that tries each in order
      return {
        effectiveProvider: null,
        validationError: 'NotImplementedException: providers prop (stacked providers) not yet implemented',
        renderFromBaseOnly: false
      };
    }

    return { effectiveProvider: null, validationError: null, renderFromBaseOnly: false };
  }, [inline, files, provider, providers, baseIdMap, resolveProvider]);

  // Parse content when provider or source changes
  useEffect(() => {
    if (!effectiveProvider || validationError) return;

    let cancelled = false;

    async function doParse() {
      try {
        // Determine what content to parse
        let content: string;
        let prov: string[];

        if (inline) {
          content = inline;
          prov = provenance ? [provenance] : ['inline://'];
        } else if (files) {
          // Find the main OLX file - prefer one matching the id or first .olx file
          const olxFiles = Object.keys(files).filter(f => f.endsWith('.olx') || f.endsWith('.xml'));
          const mainFile = olxFiles.find(f => f.includes(id)) || olxFiles[0];

          if (!mainFile) {
            throw new Error('No .olx or .xml file found in files prop');
          }

          content = files[mainFile];
          prov = provenance ? [provenance] : [`memory://${mainFile}`];
        } else if (provider) {
          // Provider mode - need to read from provider
          // For now, we assume caller knows the file structure
          // Future: could scan for files or use provenance
          throw new Error('NotImplementedException: provider prop requires provenance to know which file to load');
        } else {
          throw new Error('No valid content source');
        }

        const result = await parseOLX(content, prov, effectiveProvider);

        if (!cancelled) {
          setParsed(result);
          setError(null);
        }
      } catch (err) {
        console.error('RenderOLX parse error:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          setError(errorMsg);
          onError?.(err instanceof Error ? err : new Error(errorMsg));
        }
      }
    }

    doParse();

    return () => {
      cancelled = true;
    };
  }, [effectiveProvider, validationError, inline, files, provider, id, provenance, onError]);

  // Merge parsed idMap with baseIdMap
  const mergedIdMap = useMemo(() => {
    // If rendering from baseIdMap only, use it directly
    if (renderFromBaseOnly && baseIdMap) {
      return baseIdMap;
    }
    if (!parsed) return null;
    return baseIdMap ? { ...baseIdMap, ...parsed.idMap } : parsed.idMap;
  }, [parsed, baseIdMap, renderFromBaseOnly]);

  // Render the content
  const rendered = useMemo(() => {
    if (!mergedIdMap) return null;

    // For renderFromBaseOnly, we don't have a parsed.root, so just use the id
    if (renderFromBaseOnly) {
      if (!mergedIdMap[id]) {
        return <div className="text-red-600">RenderOLX: ID &quot;{id}&quot; not found in baseIdMap</div>;
      }
      try {
        return render({
          key: id,
          node: id,
          idMap: mergedIdMap,
          nodeInfo: makeRootNode(),
          componentMap,
        });
      } catch (err) {
        console.error('RenderOLX render error:', err);
        return null;
      }
    }

    if (!parsed) return null;

    // Use specified id, or fall back to parsed root
    const rootId = mergedIdMap[id] ? id : parsed.root;

    if (!mergedIdMap[rootId]) {
      return <div className="text-red-600">RenderOLX: ID &quot;{id}&quot; not found in content</div>;
    }

    try {
      return render({
        key: rootId,
        node: rootId,
        idMap: mergedIdMap,
        nodeInfo: makeRootNode(),
        componentMap,
      });
    } catch (err) {
      console.error('RenderOLX render error:', err);
      return null;
    }
  }, [mergedIdMap, parsed, id, componentMap, renderFromBaseOnly]);

  // Handle validation error
  if (validationError) {
    return <div className="text-red-600">{validationError}</div>;
  }

  // Handle runtime error state
  if (error) {
    return (
      <div className="text-red-600 p-2 border border-red-300 rounded bg-red-50">
        <div className="font-semibold">Error rendering OLX</div>
        <pre className="text-sm mt-1 whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  // Handle loading state
  if (!rendered) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <ErrorBoundary
      resetKey={parsed}
      handler={(err) => {
        setError(err.message);
        onError?.(err);
      }}
    >
      {rendered}
    </ErrorBoundary>
  );
}
