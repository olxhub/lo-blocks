// src/components/common/RenderOLX.tsx
//
// Generic component for rendering OLX content from various sources.
//
// Abstracts the OLX parsing and rendering pipeline. Supports STACKING -
// multiple content sources combine with higher-priority sources overriding.
//
// Priority order (highest to lowest):
//   1. inline - Direct OLX string (e.g., user's current edits)
//   2. files - Virtual filesystem with multiple files
//   3. provider/providers - Storage providers for resolution
//   4. baseIdMap - Pre-parsed content (lowest priority)
//
// Usage:
//   <RenderOLX id="demo" inline="<Markdown>Hello</Markdown>" />
//   <RenderOLX id="page" inline={edits} baseIdMap={systemContent} />
//
// =============================================================================
// ARCHITECTURE TODO
// =============================================================================
//
// Current implementation parses inline/files content directly. The intended
// design is to unify with syncContentFromStorage for proper change detection:
//
// 1. Each provider implements loadXmlFilesWithStats() returning:
//    { added, changed, unchanged, deleted } with content hashes in _metadata
//
// 2. StackedStorageProvider.loadXmlFilesWithStats() merges results from all
//    providers, with higher-priority providers' files shadowing lower ones
//
// 3. RenderOLX calls syncContentFromStorage(stackedProvider) which:
//    - Scans all providers for OLX/XML files
//    - Parses only added/changed files (using hashes for change detection)
//    - Maintains incremental idMap updates
//    - Returns merged idMap ready for rendering
//
// 4. For live editing, InMemoryStorageProvider tracks writes and reports
//    changes on subsequent loadXmlFilesWithStats() calls (similar to immer)
//
// This unifies the content loading pipeline and enables efficient incremental
// updates for the editor, documentation examples, and production rendering.
//
// =============================================================================
//
'use client';

import { useState, useEffect, useMemo } from 'react';
import { parseOLX } from '@/lib/content/parseOLX';
import { render, makeRootNode } from '@/lib/render';
import { COMPONENT_MAP } from '@/components/componentMap';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { InMemoryStorageProvider, StackedStorageProvider } from '@/lib/storage';

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
}) {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  // Build provider stack for src="" resolution during parsing
  const effectiveProvider = useMemo(() => {
    const stack = [];

    if (inline) {
      stack.push(new InMemoryStorageProvider({ '_inline.olx': inline }));
    }
    if (files) {
      stack.push(new InMemoryStorageProvider(files));
    }
    if (provider) {
      stack.push(provider);
    }
    if (providers) {
      stack.push(...providers);
    }
    if (resolveProvider) {
      stack.push(resolveProvider);
    }

    if (stack.length === 0) return null;
    if (stack.length === 1) return stack[0];
    return new StackedStorageProvider(stack);
  }, [inline, files, provider, providers, resolveProvider]);

  // Parse inline/files content
  useEffect(() => {
    // Nothing to parse - render from baseIdMap only
    if (!inline && !files) {
      setParsed(null);
      setError(null);
      return;
    }

    if (!effectiveProvider) {
      setError('RenderOLX: No provider for content resolution');
      return;
    }

    let cancelled = false;

    async function doParse() {
      try {
        // Parse inline content
        if (inline) {
          const result = await parseOLX(
            inline,
            [provenance || 'inline://'],
            effectiveProvider
          );
          if (!cancelled) {
            setParsed(result);
            setError(null);
          }
          return;
        }

        // Parse all OLX/XML files from files prop
        if (files) {
          let mergedIdMap = {};
          let lastRoot = null;

          for (const [filename, content] of Object.entries(files)) {
            if (!filename.endsWith('.olx') && !filename.endsWith('.xml')) {
              continue;
            }

            const result = await parseOLX(
              content,
              [provenance || `memory://${filename}`],
              effectiveProvider
            );

            mergedIdMap = { ...mergedIdMap, ...result.idMap };
            lastRoot = result.root;
          }

          if (!cancelled) {
            setParsed({
              root: lastRoot,
              idMap: mergedIdMap,
              ids: Object.keys(mergedIdMap)
            });
            setError(null);
          }
        }
      } catch (err) {
        console.error('RenderOLX parse error:', err);
        if (!cancelled) {
          setError(err.message || String(err));
          onError?.(err);
        }
      }
    }

    doParse();
    return () => { cancelled = true; };
  }, [inline, files, effectiveProvider, provenance, onError]);

  // Merge parsed idMap with baseIdMap (parsed overrides base)
  const mergedIdMap = useMemo(() => {
    if (!parsed && !baseIdMap) return null;
    if (!parsed) return baseIdMap;
    if (!baseIdMap) return parsed.idMap;
    return { ...baseIdMap, ...parsed.idMap };
  }, [parsed, baseIdMap]);

  // Render content
  const rendered = useMemo(() => {
    if (!mergedIdMap) return null;

    // Use requested id, fall back to parsed root
    const rootId = mergedIdMap[id] ? id : (parsed?.root || id);

    if (!mergedIdMap[rootId]) {
      return (
        <div className="text-red-600">
          RenderOLX: ID &quot;{id}&quot; not found in content
        </div>
      );
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
  }, [mergedIdMap, parsed, id, componentMap]);

  // Error state
  if (error) {
    return (
      <div className="text-red-600 p-2 border border-red-300 rounded bg-red-50">
        <div className="font-semibold">Error rendering OLX</div>
        <pre className="text-sm mt-1 whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  // No content
  if (!mergedIdMap) {
    if (!inline && !files && !baseIdMap) {
      return (
        <div className="text-red-600">
          RenderOLX: No content source provided
        </div>
      );
    }
    return <div className="text-gray-500">Loading...</div>;
  }

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
