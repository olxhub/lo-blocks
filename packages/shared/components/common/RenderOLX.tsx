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
import { parseOLX } from '@/lib/content/parseOLX';
import { makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Spinner from '@/components/common/Spinner';
import { InMemoryStorageProvider, StackedStorageProvider, toMemoryRef } from '@/lib/lofs';
import { isOLXFile } from '@/lib/util/fileTypes';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { useBlock } from '@/lib/blocks/useRenderedBlock';
import { registerAdvanceRoot, unregisterAdvanceRoot } from '@/lib/advance';
import { useBaselineRuntime } from '@/lib/blocks/baselineRuntime';
import type { ContentNamespace, IdPrefix, StateKey, LoBlockRuntimeContext, OlxDomNode, OLXLoadingError } from '@/lib/types';
import { PLACEHOLDER_NS } from '@/lib/types/id-grammar';
import { toLofsRef } from '@/lib/types/address';



/**
 * Build the provider stack for src="" resolution during parsing.
 * Stacks inline, files, provider, providers, resolveProvider in priority order.
 */
function useBuildProviderStack(
  inline?: string,
  files?: Record<string, string>,
  provider?: any,
  providers?: any[],
  resolveProvider?: any
) {
  return useMemo(() => {
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
}

/**
 * Parse inline and/or files content.
 * Returns parsed result with idMap and root, or null if nothing to parse.
 */
function useParseContent(
  inline?: string,
  files?: Record<string, string>,
  effectiveProvider?: any,
  provenance?: string,
  source?: string,
  logEvent?: any,
  sideEffectFree?: boolean,
  onError?: (err: any) => void,
  ns?: ContentNamespace
) {
  const [parsed, setParsed] = useState<any>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);     // content can't render
  const [warnings, setWarnings] = useState<OLXLoadingError[]>([]);       // content renders, but has issues
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Nothing to parse - render from baseIdMap only
    if (!inline && !files) {
      startTransition(() => {
        setParsed(null);
        setFatalError(null);
      });
      return;
    }

    if (!effectiveProvider) {
      setFatalError('RenderOLX: No provider for content resolution');
      return;
    }

    let cancelled = false;

    async function doParse() {
      try {
        // Parse inline content
        if (inline) {
          const result = await parseOLX(
            inline,
            [toLofsRef(provenance || 'inline://')],
            effectiveProvider,
            ns
          );
          if (!cancelled) {
            // Dispatch to Redux for reactive block access (skip during replay - viewing historical state)
            if (!sideEffectFree) {
              if (!logEvent) throw new Error('useParseContent: logEvent is required for dispatching');
              if (!source) throw new Error('useParseContent: source is required for dispatching');
              dispatchOlxJson({ runtime: { logEvent } }, source, result.idMap);
            }
            // startTransition prevents Suspense - shows old content while rendering new
            startTransition(() => {
              setParsed(result);
              setFatalError(null);
              setWarnings(result.errors || []);
            });
          }
          return;
        }

        // Parse all OLX/XML files from files prop
        if (files) {
          let mergedIdMap = {};
          let lastRoot: string | null = null;
          let allErrors: OLXLoadingError[] = [];

          for (const [filename, content] of Object.entries(files)) {
            if (!isOLXFile(filename)) {
              continue;
            }

            const result = await parseOLX(
              content,
              [provenance ? toLofsRef(provenance) : toMemoryRef(filename)],
              effectiveProvider,
              ns
            );

            mergedIdMap = { ...mergedIdMap, ...result.idMap };
            lastRoot = result.root;
            if (result.errors?.length) {
              allErrors = [...allErrors, ...result.errors];
            }
          }

          if (!cancelled) {
            // Dispatch to Redux for reactive block access (skip during replay - viewing historical state)
            if (!sideEffectFree) {
              if (!logEvent) throw new Error('useParseContent: logEvent is required for dispatching');
              if (!source) throw new Error('useParseContent: source is required for dispatching');
              dispatchOlxJson({ runtime: { logEvent } }, source, mergedIdMap);
            }
            startTransition(() => {
              setParsed({
                root: lastRoot,
                idMap: mergedIdMap,
                ids: Object.keys(mergedIdMap)
              });
              setFatalError(null);
              setWarnings(allErrors);
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setFatalError(err.message || String(err));
          onError?.(err);
        }
      }
    }

    doParse();
    return () => { cancelled = true; };
  }, [inline, files, effectiveProvider, provenance, onError, startTransition, source, sideEffectFree, logEvent, ns]);

  return { parsed, fatalError, warnings, isPending };
}

/**
 * Merge parsed content idMap with baseIdMap.
 * Parsed content overrides base (higher priority).
 */
function mergeContentIntoProps(baselineProps: any, parsed: any, baseIdMap?: Record<string, any>) {
  const mergedIdMap = baseIdMap ? { ...baseIdMap, ...parsed?.idMap } : parsed?.idMap;
  return { ...baselineProps, parsed, mergedIdMap };
}

/**
 * Update props with a new locale.
 */
function updatePropsLocale(props: any, locale: any) {
  return { ...props, locale };
}

/**
 * Update props with a new logEvent function.
 */
function updatePropsLogEvent(props: any, logEvent: any) {
  return { ...props, logEvent };
}

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
  /** Content namespace — identifies the logical content source (e.g. 'docs', 'ee101'). */
  ns?: ContentNamespace;
  /** The ID to render from the merged idMap. StateKey because it names a
   *  runtime instance (which may include scope markers for nested contexts). */
  id: StateKey;
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
  /** Source identifier for debugging/tracking (e.g., 'file:content://path/to.olx') */
  provenance?: string;
  /** Called when parsing or rendering errors occur */
  onError?: (err: any) => void;
  /** Called after parsing completes with the merged idMap and root ID */
  onParsed?: (result: { idMap: Record<string, any>; root: string | null }) => void;
  /** Custom block registry (defaults to BLOCK_REGISTRY) */
  blockRegistry?: Record<string, any>;
  /** Source name for Redux state namespacing (e.g., 'content', 'inline', 'studio'). Defaults to 'content'. */
  source?: string;
  /** Event context root (e.g., 'preview', 'studio'). Sets the root nodeInfo ID for event context hierarchy. */
  eventContext?: string;
  /** Ref to expose the root OlxDomNode for external tree inspection.
   *
   *  TIMING CAVEAT: The ref is populated during render, but the tree (renderedKids)
   *  is built lazily as child components render. External consumers reading this
   *  ref in the same render cycle may see an incomplete tree. In practice this
   *  works because consumers (StatePanel) re-render from Redux state changes,
   *  by which time the tree is populated. But this assumption may break in:
   *  - First render (no Redux state yet → StatePanel returns null anyway)
   *  - Replay mode (state exists without rendering → tree may be stale)
   *  - Concurrent React features (siblings may render out of order)
   *
   *  If these become real problems, consider switching to a useEffect callback
   *  or React context that fires after the full subtree has committed.
   */
  nodeInfoRef?: React.MutableRefObject<OlxDomNode | null>;
}

export default function RenderOLX({
  ns,
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
  eventContext,
  nodeInfoRef,
}: RenderOLXProps) {
  // Build baseline runtime context - use bare runtime, not wrapped BaselineProps
  let runtimeContext = useBaselineRuntime();

  // Override blockRegistry if a custom one was provided
  if (blockRegistry !== BLOCK_REGISTRY) {
    runtimeContext = { ...runtimeContext, blockRegistry };
  }

  // Build provider stack for src="" resolution
  const effectiveProvider = useBuildProviderStack(inline, files, provider, providers, resolveProvider);

  // Parse inline/files content
  const { parsed, fatalError, warnings, isPending } = useParseContent(
    inline,
    files,
    effectiveProvider,
    provenance,
    source,
    runtimeContext.logEvent,
    runtimeContext.sideEffectFree,
    onError,
    ns
  );

  // Merge parsed content into runtime context
  const renderProps = mergeContentIntoProps(runtimeContext, parsed, baseIdMap);

  // Notify parent when content is parsed
  useEffect(() => {
    if (onParsed && renderProps.mergedIdMap) {
      onParsed({ idMap: renderProps.mergedIdMap, root: parsed?.root || null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderProps.mergedIdMap, parsed?.root]);

  // Build runtime context for rendering
  const runtime: LoBlockRuntimeContext = {
    blockRegistry: renderProps.blockRegistry,
    store: renderProps.store,
    logEvent: renderProps.logEvent,
    sideEffectFree: renderProps.sideEffectFree,
    olxJsonSources: [source],
    idPrefix: '' as IdPrefix,
    ns: ns ?? PLACEHOLDER_NS,
    locale: renderProps.locale,
    cast: {},
  };

  // Stabilize root nodeInfo across renders so renderedKids accumulates
  // (render.tsx reuses existing entries via `if (!childNodeInfo)` check).
  // Previously makeRootNode was called fresh every render, causing the
  // entire nodeInfo tree to be rebuilt from scratch each time.
  const stableRootRef = useRef<OlxDomNode | null>(null);
  if (!stableRootRef.current) {
    // Root node uses a minimal sentinel loBlock (not a full LoBlock),
    // so we need the double assertion. This is consistent with makeRootNode's design.
    stableRootRef.current = makeRootNode(runtime, eventContext) as unknown as OlxDomNode;
  }
  // Keep runtime current (locale, logEvent, etc. can change between renders)
  stableRootRef.current.runtime = runtime;

  // Register root for global spacebar advance
  useEffect(() => {
    const root = stableRootRef.current;
    if (!root) return;
    registerAdvanceRoot(root);
    return () => unregisterAdvanceRoot(root);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- stable root, runs once

  // Expose root nodeInfo to callers (see timing caveat on nodeInfoRef prop)
  if (nodeInfoRef) {
    nodeInfoRef.current = stableRootRef.current;
  }

  // Build props for useBlock
  const blockProps = {
    nodeInfo: stableRootRef.current,
    runtime,
  };

  // Determine which ID to render - use parsed root if available, else requested id
  const renderIdToQuery = parsed?.root || id;

  // Wait for parsing to complete when inline/files content is provided
  const parsingPending = (inline || files) && !parsed;

  const localeReady = !!runtime.locale?.code;

  // useBlock must be called unconditionally (Rules of Hooks) - pass null
  // when locale or content isn't ready yet, which useBlock handles gracefully
  const { block, ready } = useBlock(
    blockProps,
    (!localeReady || parsingPending) ? null : renderIdToQuery,
    source
  );

  // Wait for locale to be available before rendering children
  // (setReduxLocale is de facto synchronous, but adding a guard ensures
  // we never render with undefined locale, which would break all selectValue logic)
  if (!localeReady) {
    return <Spinner>Loading language settings...</Spinner>;
  }

  // Parse error (from inline/files parsing)
  if (fatalError) {
    return (
      <div className="text-error p-2 border border-error rounded bg-error-subtle">
        <div className="font-semibold">Error rendering OLX</div>
        <pre className="text-sm mt-1 whitespace-pre-wrap">{fatalError}</pre>
      </div>
    );
  }

  // No content source provided
  if (!inline && !files && !baseIdMap && !ready) {
    return (
      <div className="text-error">
        RenderOLX: No content source provided
      </div>
    );
  }

  // Parsing in progress - show loading state
  if (parsingPending) {
    return <Spinner>Parsing...</Spinner>;
  }

  // useBlock handles spinner/error display - just wrap in ErrorBoundary
  return (
    <ErrorBoundary
      resetKey={parsed}
      handler={(err) => {
        onError?.(err);
      }}
    >
      {warnings.length > 0 && (
        <div className="text-warning p-3 border border-warning rounded bg-warning-subtle mb-2 text-sm">
          <div className="font-semibold mb-1">
            {warnings.length} content {warnings.length === 1 ? 'warning' : 'warnings'}
          </div>
          {warnings.map((err, i) => (
            <details key={i} className="mb-1">
              <summary>{err.title}</summary>
              <pre className="whitespace-pre-wrap mt-1 text-xs">{err.message}</pre>
            </details>
          ))}
        </div>
      )}
      {block}
    </ErrorBoundary>
  );
}
