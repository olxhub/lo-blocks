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

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { useStore } from 'react-redux';
import * as lo_event from 'lo_event';
import { parseOLX } from '@/lib/content/parseOLX';
import { makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Spinner from '@/components/common/Spinner';
import { InMemoryStorageProvider, StackedStorageProvider, toMemoryProvenanceURI } from '@/lib/lofs';
import { isOLXFile } from '@/lib/util/fileTypes';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { useBlock } from '@/lib/blocks/useRenderedBlock';
import { useDebugSettings } from '@/lib/state/debugSettings';
import { settings } from '@/lib/state/settings';
import { useSetting } from '@/lib/state/settingsAccess';
import { getTextDirection, getBrowserLocale } from '@/lib/i18n/getTextDirection';
import type { BaselineProps, IdPrefix, LoBlockRuntimeContext, UserLocale, ProvenanceURI } from '@/lib/types';

// Stable no-op for replay mode - avoids creating new function on each render
const noopLogEvent = () => { };

// ============================================================================
// HELPER HOOKS AND FUNCTIONS
// ============================================================================

/**
 * Build baseline runtime context: logEvent, locale, store, blockRegistry.
 * Returns the core runtime bundle that's available everywhere in the system.
 *
 * This is returned as a bare LoBlockRuntimeContext for functions that work
 * directly with runtime properties. Most consumers should use useBaselineProps()
 * to get BaselineProps, which wraps this in the standard prop structure.
 *
 * TODO: Move to lib/blocks/baselineProps.ts once dependencies stabilize
 */
export function useBaselineRuntime(): LoBlockRuntimeContext {
  const store = useStore();
  const { replayMode } = useDebugSettings();
  const logEvent = replayMode ? noopLogEvent : lo_event.logEvent;
  const sideEffectFree = replayMode;

  // Create minimal runtime structure for useSetting call
  // Note: locale will be populated from Redux or browser below
  const runtimeForSettings: LoBlockRuntimeContext = {
    blockRegistry: BLOCK_REGISTRY,
    store,
    logEvent,
    sideEffectFree,
    locale: { code: 'eo' as UserLocale, dir: 'ltr' }  // Esperanto placeholder - overwritten from Redux/browser below
  };

  // Wrap in BaselineProps structure for useSetting
  const baselineProps: BaselineProps = { runtime: runtimeForSettings };
  const [reduxLocale, setReduxLocale] = useSetting(baselineProps, settings.locale);

  // Initialize locale from browser after hydration.
  // Must be in useEffect (not during render) to avoid SSR/client mismatch:
  // server has no navigator.language, so both sides see no locale initially,
  // then client sets browser locale after hydration.
  useEffect(() => {
    if (!reduxLocale) {
      const code = getBrowserLocale();
      const dir = getTextDirection(code);
      setReduxLocale({ code, dir });
    }
  }, [reduxLocale, setReduxLocale]);

  // Before hydration, locale is empty. Pages should gate on locale being
  // ready (via useLocaleAttributes().lang) before rendering localized content.
  const locale = reduxLocale || { code: '' as UserLocale, dir: 'ltr' as const };

  return {
    blockRegistry: BLOCK_REGISTRY,
    store,
    logEvent,
    sideEffectFree,
    locale
  };
}

/**
 * Get baseline props for global/system context.
 *
 * Returns BaselineProps which wraps LoBlockRuntimeContext in the standard prop
 * structure. This is what most system-level functions expect (useSetting,
 * LanguageSwitcher, etc.).
 *
 * Prefer this over useBaselineRuntime() unless you specifically need the
 * bare runtime context.
 */
export function useBaselineProps(): BaselineProps {
  const runtime = useBaselineRuntime();
  return { runtime };
}

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
  onError?: (err: any) => void
) {
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
            [(provenance || 'inline://') as ProvenanceURI],
            effectiveProvider
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
              [provenance as ProvenanceURI || toMemoryProvenanceURI(filename)],
              effectiveProvider
            );

            mergedIdMap = { ...mergedIdMap, ...result.idMap };
            lastRoot = result.root;
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
              setError(null);
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || String(err));
          onError?.(err);
        }
      }
    }

    doParse();
    return () => { cancelled = true; };
  }, [inline, files, effectiveProvider, provenance, onError, startTransition, source, sideEffectFree, logEvent]);

  return { parsed, error, isPending };
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
  /** Event context root (e.g., 'preview', 'studio'). Sets the root nodeInfo ID for event context hierarchy. */
  eventContext?: string;
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
  eventContext,
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
  const { parsed, error: parseError, isPending } = useParseContent(
    inline,
    files,
    effectiveProvider,
    provenance,
    source,
    runtimeContext.logEvent,
    runtimeContext.sideEffectFree,
    onError
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
    locale: renderProps.locale,
  };

  // Build props for useBlock
  const blockProps = {
    nodeInfo: makeRootNode(runtime, eventContext),
    runtime,
    // FIXME: These individual fields are deprecated (kept for migration safety, remove after verification)
    blockRegistry: renderProps.blockRegistry,
    idPrefix: '',
    olxJsonSources: [source],
    store: renderProps.store,
    logEvent: renderProps.logEvent,
    sideEffectFree: renderProps.sideEffectFree,
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
  // we never render with undefined locale, which would break all getValue logic)
  if (!localeReady) {
    return <Spinner>Loading language settings...</Spinner>;
  }

  // Parse error (from inline/files parsing)
  if (parseError) {
    return (
      <div className="text-red-600 p-2 border border-red-300 rounded bg-red-50">
        <div className="font-semibold">Error rendering OLX</div>
        <pre className="text-sm mt-1 whitespace-pre-wrap">{parseError}</pre>
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
      {block}
    </ErrorBoundary>
  );
}
