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

import React, { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import { useStore } from 'react-redux';
import * as lo_event from 'lo_event';
import { parseOLX } from '@/lib/content/parseOLX';
import { makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { InMemoryStorageProvider, StackedStorageProvider } from '@/lib/storage';
import { isOLXFile } from '@/lib/util/fileTypes';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { useBlock } from '@/lib/blocks/useRenderedBlock';
import { useReplayContextOptional } from '@/lib/state/replayContext';

/**
 * Props for RenderOLX component.
 *
 * Content sources are stacked in priority order (highest to lowest):
 *   1. inline - parsed first, overrides everything
 *   2. files - parsed second
 *   3. provider/providers - used for resolving src="" references during parsing
 *   4. baseIdMap - pre-parsed content, used as fallback
 */
interface RenderOLXProps {
  /** The ID to render from the merged idMap */
  id: any;
  /** Raw OLX string to parse and render (highest priority) */
  inline?: string;
  /** Virtual filesystem: { 'filename.olx': '<OLX>...</OLX>' } - all .olx/.xml files are parsed */
  files?: Record<string, string>;
  /** Single storage provider for resolving src="" references during parsing */
  provider?: any;
  /** Array of storage providers (use when you have multiple) - spread into the stack after `provider` */
  providers?: any[];
  /** Pre-parsed idMap to use as base content (lowest priority, overridden by parsed content) */
  baseIdMap?: Record<string, any>;
  /** Storage provider for resolving references - added at end of stack (lowest priority for resolution) */
  resolveProvider?: any;
  /** Source identifier for debugging/tracking (e.g., 'file:///path/to.olx') */
  provenance?: string;
  /** Called when parsing or rendering errors occur */
  onError?: (err: any) => void;
  /** Called after parsing completes with the merged idMap and root ID */
  onParsed?: (result: { idMap: Record<string, any>; root: string | null }) => void;
  /** Custom block registry (defaults to BLOCK_REGISTRY) */
  blockRegistry?: Record<string, any>;
  /** Source name for Redux state namespacing (e.g., 'content', 'inline', 'studio'). Defaults to 'content'. */
  source?: string;
}

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
  onParsed,
  blockRegistry = BLOCK_REGISTRY,
  source = 'content',
}: RenderOLXProps) {
  const store = useStore();
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if we're in replay mode - if so, use no-op to prevent event logging
  // and disable side effects (fetches, etc.)
  const replayCtx = useReplayContextOptional();
  const noopLogEvent = () => {};
  const isReplaying = replayCtx?.isActive ?? false;
  const logEvent = isReplaying ? noopLogEvent : lo_event.logEvent;
  const sideEffectFree = isReplaying;

  // useTransition prevents Suspense during edits - React shows stale content
  // while new content is preparing instead of showing spinners
  const [isPending, startTransition] = useTransition();

  // Build provider stack for src="" resolution during parsing
  const effectiveProvider = useMemo(() => {
    const stack: any[] = [];

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
      startTransition(() => {
        setParsed(null);
        setError(null);
      });
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
            // Dispatch to Redux for reactive block access (skip during replay - viewing historical state)
            if (!sideEffectFree) {
              dispatchOlxJson({ logEvent }, source, result.idMap);
            }
            // startTransition prevents Suspense - shows old content while rendering new
            startTransition(() => {
              setParsed(result);
              setError(null);
            });
          }
          return;
        }

        // Parse all OLX/XML files from files prop
        if (files) {
          let mergedIdMap = {};
          let lastRoot: string | null = null;

          for (const [filename, content] of Object.entries(files)) {
            if (!isOLXFile(filename)) {
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
            // Dispatch to Redux for reactive block access (skip during replay - viewing historical state)
            if (!sideEffectFree) {
              dispatchOlxJson({ logEvent }, source, mergedIdMap);
            }
            startTransition(() => {
              setParsed({
                root: lastRoot,
                idMap: mergedIdMap,
                ids: Object.keys(mergedIdMap)
              });
              setError(null);
            });
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
  }, [inline, files, effectiveProvider, provenance, onError, startTransition, source, sideEffectFree, logEvent]);

  // Merge parsed idMap with baseIdMap (parsed overrides base)
  const mergedIdMap = useMemo(() => {
    if (!parsed && !baseIdMap) return null;
    if (!parsed) return baseIdMap;
    if (!baseIdMap) return parsed.idMap;
    return { ...baseIdMap, ...parsed.idMap };
  }, [parsed, baseIdMap]);

  // Use ref for onParsed to avoid infinite loops when caller passes inline function
  const onParsedRef = useRef(onParsed);
  onParsedRef.current = onParsed;

  // Notify parent when idMap changes
  useEffect(() => {
    if (onParsedRef.current && mergedIdMap) {
      onParsedRef.current({ idMap: mergedIdMap, root: parsed?.root || null });
    }
  }, [mergedIdMap, parsed?.root]);

  // Build props for useBlock - must be before the hook call
  const blockProps = useMemo(() => ({
    nodeInfo: makeRootNode(),
    blockRegistry,
    idPrefix: '',
    olxJsonSources: [source],
    store,
    logEvent,
    sideEffectFree,
  }), [blockRegistry, source, store, logEvent, sideEffectFree]);

  // Determine which ID to render - use parsed root if available, else requested id
  // This handles the case where `id` is a file path but parsed content has different IDs
  const renderIdToQuery = parsed?.root || id;

  // useBlock handles loading/error states and renders from Redux
  // Shows spinner while loading, error if failed, rendered content when ready
  const { block, ready } = useBlock(blockProps, renderIdToQuery, source);

  // Parse error (from inline/files parsing)
  if (error) {
    return (
      <div className="text-red-600 p-2 border border-red-300 rounded bg-red-50">
        <div className="font-semibold">Error rendering OLX</div>
        <pre className="text-sm mt-1 whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  // No content source provided
  if (!inline && !files && !baseIdMap && !ready) {
    return (
      <div className="text-red-600">
        RenderOLX: No content source provided
      </div>
    );
  }

  // useBlock handles spinner/error display - just wrap in ErrorBoundary
  return (
    <ErrorBoundary
      resetKey={parsed}
      handler={(err) => {
        setError(err.message);
        onError?.(err);
      }}
    >
      {block}
    </ErrorBoundary>
  );
}
