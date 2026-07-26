// packages/shared/components/common/RenderOLX.tsx
//
// Generic component for rendering OLX content from various sources.
//
// Renders PURELY from Redux via the content ledger (lib/state/content.ts +
// useContent). There is NO local React state for content or readiness — the
// ledger is the single source of truth, so the async event queue can never race
// a locally-held "I'm ready" flag (the bug the durable IndexedDB queue exposed).
//
// Declared-source model. Content is declared with WHERE it comes from, and the
// fetch decision is made at that point, not guessed at read time:
//   1. inline  - raw OLX string (user's edits)          → parsed locally
//   2. files   - virtual filesystem                     → parsed locally
//   3. provider/providers/resolveProvider               → resolve src="" refs
//   4. baseIdMap - pre-parsed content (preloaded)        → Redux overlay
// inline/files content is NEVER server-fetched.
//
// Usage:
//   <RenderOLX id="demo" inline="<Markdown>Hello</Markdown>" />
//   <RenderOLX id="page" baseIdMap={systemContent} />
//
'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { makeRootNode } from '@/lib/player/client/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { toAppError } from '@/lib/types/errors';
import Spinner from '@/components/common/Spinner';
import { InMemoryStorageProvider, StackedStorageProvider } from '@/lib/storage/lofs';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { logContentRenderFailed, contentKeyOf } from '@/lib/state/content';
import { useContent } from '@/lib/player/client/useContent';
import { useBlock } from '@/lib/player/client/useRenderedBlock';
import { DisplayError } from '@/lib/util/debug';
import { registerAdvanceRoot, unregisterAdvanceRoot } from '@/lib/player/advance';
import { useBaselineRuntime } from '@/lib/player/client/baselineRuntime';
import { safeStringify } from '@/lib/util';
import type { ContentNamespace, IdPrefix, StateKey, LoBlockRuntimeContext, OlxDomNode } from '@/lib/types';

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
 * Props for RenderOLX component.
 *
 * Content sources are stacked in priority order (highest to lowest):
 *   1. inline - parsed first, overrides everything
 *   2. files - parsed second
 *   3. provider/providers - used for resolving src="" references during parsing
 *   4. baseIdMap - pre-parsed content, used as fallback
 */
interface RenderOLXProps {
  /** Content namespace — identifies the logical content source (e.g.
   *  'psych', 'docs.ActionButton'). Required: every render pathway must
   *  say what namespace its content lives in. Scratch contexts use named
   *  synthetic namespaces ('olxEmbed', 'pegPreview', ...). */
  ns: ContentNamespace;
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
  /** Pre-parsed idMap to use as base content (preloaded). Folded into the
   *  OlxJson slice as a Redux overlay so it renders through the normal
   *  pipeline — no private content path. */
  baseIdMap?: Record<string, any>;
  /** Storage provider for resolving references - added at end of stack (lowest priority for resolution) */
  resolveProvider?: any;
  /** Source identifier for debugging/tracking (e.g., 'file:content://path/to.olx') */
  provenance?: string;
  /** Called with a canonical AppError when parsing or rendering fails. For
   *  render errors, `technical` carries React's component stack (which block). */
  onError?: (error: import('@/lib/types/errors').AppError) => void;
  /** Called after content is ready with the root ID. Parsed blocks are NOT
   *  passed back: they land in Redux (the OlxJson slice) as part of the same
   *  fold, so a caller that wants them selects them rather than catching them
   *  in flight. */
  onParsed?: (result: { root: string | null }) => void;
  /** Custom block registry (defaults to BLOCK_REGISTRY) */
  blockRegistry?: Record<string, any>;
  /** Source name for Redux state namespacing (e.g., 'content', 'inline', 'studio'). Defaults to 'content'. */
  source?: string;
  /** Event context root (e.g., 'preview', 'studio'). Sets the root nodeInfo ID for event context hierarchy. */
  eventContext?: string;
  /** Debounce (ms) for re-parsing live-edited inline content. Default 0. */
  debounceMs?: number;
  /** Initial idPrefix for scoping the rendered block's state key.
   *  Defaults to '' (root level). Set this when rendering a block that
   *  should share state with a scoped instance inside another tree
   *  (e.g., a repo detail page sharing state with a catalog card). */
  idPrefix?: IdPrefix;
  /** Ref to expose the root OlxDomNode for external tree inspection.
   *
   *  TIMING CAVEAT: The ref is populated during render, but the tree (renderedKids)
   *  is built lazily as child components render. External consumers reading this
   *  ref in the same render cycle may see an incomplete tree. In practice this
   *  works because consumers (StatePanel) re-render from Redux state changes,
   *  by which time the tree is populated.
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
  debounceMs = 0,
  nodeInfoRef,
  idPrefix: initialIdPrefix,
}: RenderOLXProps) {
  // Build baseline runtime context - use bare runtime, not wrapped BaselineProps
  let runtimeContext = useBaselineRuntime();

  // Override blockRegistry if a custom one was provided
  if (blockRegistry !== BLOCK_REGISTRY) {
    runtimeContext = { ...runtimeContext, blockRegistry };
  }

  // Build provider stack for src="" resolution
  const effectiveProvider = useBuildProviderStack(inline, files, provider, providers, resolveProvider);

  // Fold baseIdMap into the OlxJson slice as a Redux overlay (idempotent merge),
  // so preloaded content renders through the normal pipeline with no private
  // content path. Skipped during replay (content already in the event stream).
  useEffect(() => {
    if (baseIdMap && !runtimeContext.sideEffectFree) {
      dispatchOlxJson({ runtime: { logEvent: runtimeContext.logEvent } }, source, baseIdMap);
    }
  }, [baseIdMap, source, runtimeContext.logEvent, runtimeContext.sideEffectFree]);

  // Declare the content request + read its render view — purely from Redux.
  const view = useContent({
    ns,
    id,
    inline,
    files,
    provider: effectiveProvider,
    provenance,
    blockSource: source,
    runtime: { logEvent: runtimeContext.logEvent, sideEffectFree: runtimeContext.sideEffectFree },
    debounceMs,
    onError,
  });

  const renderIdToQuery = (view.root ?? id) as StateKey;

  // Notify parent when content becomes ready.
  useEffect(() => {
    if (onParsed && view.ready) {
      onParsed({ root: view.root });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.ready, view.root]);

  // Build runtime context for rendering
  const runtime: LoBlockRuntimeContext = {
    blockRegistry: runtimeContext.blockRegistry,
    store: runtimeContext.store,
    logEvent: runtimeContext.logEvent,
    sideEffectFree: runtimeContext.sideEffectFree,
    olxJsonSources: [source],
    idPrefix: initialIdPrefix ?? ('' as IdPrefix),
    ns,
    locale: runtimeContext.locale,
    cast: {},
  };

  // Stabilize root nodeInfo across renders so renderedKids accumulates.
  const stableRootRef = useRef<OlxDomNode | null>(null);
  if (!stableRootRef.current) {
    stableRootRef.current = makeRootNode(runtime, eventContext) as unknown as OlxDomNode;
  }
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

  const blockProps = {
    nodeInfo: stableRootRef.current,
    runtime,
  };

  const localeReady = !!runtime.locale?.code;

  // useBlock must be called unconditionally (Rules of Hooks). Pass null until
  // locale AND content are ready — then the block is guaranteed to be in Redux
  // (atomic land: root and blocks arrive in the same CONTENT_PARSED fold).
  const { block } = useBlock(
    blockProps,
    (!localeReady || !view.ready) ? null : renderIdToQuery,
    source
  );

  // Wait for locale before rendering children (selectors need locale.code).
  if (!localeReady) {
    return <Spinner>Loading language settings...</Spinner>;
  }

  // Fatal parse error (malformed XML — no tree to render, no last-valid build).
  if (view.fatal) {
    return (
      <DisplayError
        title="Error rendering OLX"
        message={view.error ?? 'Content failed to load'}
        id={`${renderIdToQuery}_fatal_error`}
      />
    );
  }

  // Nothing renderable yet: no declared source with a root, and no preloaded id.
  if (!view.ready && !inline && !files && !baseIdMap) {
    return (
      <div className="text-error">
        RenderOLX: No content source provided
      </div>
    );
  }

  // First parse still in flight (no last-valid build to show yet).
  if (!view.ready) {
    return <Spinner>Parsing...</Spinner>;
  }

  // Ready: render the block. `view.updating` (a newer parse in flight or a
  // mid-typing parse error while keeping the last-valid render) surfaces gently
  // below, never by blanking the screen.
  return (
    <ErrorBoundary
      // Reset when a genuinely DIFFERENT build is on screen. `view.root` cannot
      // carry this: editing a block's contents fixes the error while leaving the
      // root id identical, which latched the boundary on a stale failure forever.
      // `view.revision` is the canonical name of the bytes being rendered, so it
      // changes exactly when the content did.
      resetKey={[renderIdToQuery, view.revision ?? view.root]}
      handler={(err, info) => {
        // Record the render-time exception as an ordinary, replayable event
        // (no synthetic OLX node, no synchronous dispatch). RenderOLX still
        // shows DisplayError via fallbackRender below.
        const error = toAppError(err, { technical: info.componentStack || undefined });
        logContentRenderFailed(
          { runtime: { logEvent: runtime.logEvent } },
          {
            key: contentKeyOf(source, ns, id),
            id: String(renderIdToQuery),
            title: error.title,
            message: error.message,
            technical: error.technical != null ? safeStringify(error.technical) : undefined,
          },
        );
        onError?.(error);
      }}
      fallbackRender={(err, info) => (
        <DisplayError
          {...toAppError(err, { technical: info?.componentStack || undefined })}
          id={`${String(renderIdToQuery)}_render_error`}
        />
      )}
    >
      {view.warnings.length > 0 && (
        <div className="text-warning p-3 border border-warning rounded bg-warning-subtle mb-2 text-sm">
          <div className="font-semibold mb-1">
            {view.warnings.length} content {view.warnings.length === 1 ? 'warning' : 'warnings'}
          </div>
          {view.warnings.map((err, i) => (
            <details key={i} className="mb-1">
              <summary>{err.title}</summary>
              <pre className="whitespace-pre-wrap mt-1 text-xs">{err.message}</pre>
            </details>
          ))}
        </div>
      )}
      {view.updating && view.error && (
        <div className="text-warning text-xs mb-1 opacity-80" title={view.error}>
          Content has an error; showing last valid version.
        </div>
      )}
      {block}
    </ErrorBoundary>
  );
}
