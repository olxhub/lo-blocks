// packages/shared/lib/player/client/useContent.ts
//
// useContent — the one combined hook for the content ledger.
//
// Requests-if-needed AND reads, because in practice the request/read split
// collapses: whoever renders content is the one who declares its source.
//
//   const view = useContent({ ns, id, inline, ... });   // request + read
//   // view: { root, ready, updating, warnings, error, fatal, renderError }
//
// The hook's ONLY job on the write side is: when the declared source changes,
// (debounced) parse it and emit CONTENT_PARSING / CONTENT_PARSED / CONTENT_FAILED
// through logEvent. Everything renderable then lives in Redux (the ledger entry
// + the block slice). No local React state for content or readiness — the cure
// for the async-queue race.
//
// The fetch decision is made HERE, at request time, by the DECLARED source:
//   - inline / files  → text in hand, parsed locally, NEVER server-fetched.
//   - preloaded       → blocks already in Redux (server fetch / baseIdMap); no
//                       parse, the ledger just reports the id as ready.
//
'use client';

import { useEffect, useRef } from 'react';
import { parseOLX } from '@/lib/content/parseOLX';
import { isOLXFile } from '@/lib/util/fileTypes';
import { toMemoryRef } from '@/lib/storage/lofs';
import { toLofsRef } from '@/lib/types/address';
import { toAppError, type AppError } from '@/lib/types/errors';
import {
  contentKeyOf, sourceSignature, shouldRequestParse, deriveContentView, useContentEntry,
  logContentParsing, logContentParsed, logContentFailed,
  type ContentView,
} from '@/lib/state/content';
import type {
  ContentNamespace, DefinitionKey, IdMap, OLXLoadingError,
  ContentLedgerSourceKind, StateKey,
} from '@/lib/types';
import type { StorageProvider } from '@/lib/types/storage';
import type { LogEventFn } from '@/lib/player/client/render';

export interface UseContentParams {
  /** Content namespace (part of the stable ledger key). */
  ns: ContentNamespace;
  /** The id the caller wants to render (StateKey). Used as the fallback root
   *  for preloaded content and before the first parse lands. */
  id: StateKey;
  /** Inline OLX text (highest-priority declared source). */
  inline?: string;
  /** Virtual filesystem: { 'file.olx': '<OLX/>' }. */
  files?: Record<string, string>;
  /** Provider stack for resolving src="" references during parsing. */
  provider?: StorageProvider | null;
  /** Provenance ref of the parsed source (base for relative refs; recorded on
   *  the ledger entry for staleness). */
  provenance?: string;
  /** OlxJson block-slice namespace the parsed blocks land in ('content', ...). */
  blockSource: string;
  /** Runtime bits needed to emit events / honor replay. */
  runtime: { logEvent: LogEventFn; sideEffectFree?: boolean };
  /** Debounce for re-parsing during live editing (ms). 0 = parse immediately. */
  debounceMs?: number;
  /** Fatal parse error callback (canonical AppError). */
  onError?: (error: AppError) => void;
}

/** Parse the declared source into { root, blocks, warnings }. */
async function parseDeclaredSource(
  params: UseContentParams,
): Promise<{ root: DefinitionKey | null; blocks: IdMap; warnings: OLXLoadingError[] }> {
  const { inline, files, provider, provenance, ns } = params;
  if (!provider) throw new Error('RenderOLX: No provider for content resolution');

  if (inline != null && inline !== '') {
    const result = await parseOLX(inline, [toLofsRef(provenance || 'inline://')], provider, ns);
    return { root: (result.root || null) as DefinitionKey | null, blocks: result.idMap, warnings: result.errors || [] };
  }

  // files
  let mergedIdMap: IdMap = {};
  let lastRoot: DefinitionKey | null = null;
  let allErrors: OLXLoadingError[] = [];
  for (const [filename, content] of Object.entries(files ?? {})) {
    if (!isOLXFile(filename)) continue;
    const result = await parseOLX(
      content,
      [provenance ? toLofsRef(provenance) : toMemoryRef(filename)],
      provider,
      ns,
    );
    mergedIdMap = { ...mergedIdMap, ...result.idMap };
    lastRoot = (result.root || null) as DefinitionKey | null;
    if (result.errors?.length) allErrors = [...allErrors, ...result.errors];
  }
  return { root: lastRoot, blocks: mergedIdMap, warnings: allErrors };
}

/**
 * Declare a content request and read its render view.
 *
 * The view is derived purely from Redux (the ledger entry + a preloaded-id
 * fallback). No local content/readiness state.
 */
export function useContent(params: UseContentParams): ContentView {
  const { ns, id, inline, files, provenance, blockSource, runtime, debounceMs = 0, onError } = params;

  const sourceKind: ContentLedgerSourceKind =
    (inline != null && inline !== '') ? 'inline'
    : (files && Object.keys(files).length > 0) ? 'files'
    : 'preloaded';

  const key = contentKeyOf(blockSource, ns, id);

  // Stable signature of the source CONTENT (not object identity). The request
  // effect depends on this string, so a re-render with fresh `files`/`provider`
  // objects does NOT re-fire it — only a real content change does.
  const signature = sourceSignature({ sourceKind, ns, id, inline, files, provenance });

  const entry = useContentEntry(key);

  // Monotonic supersede counter — the reducer rejects results older than the
  // entry's requestKey, so a slow parse that lost the race is dropped.
  const requestKeyRef = useRef(0);
  // Read the latest entry inside the effect without making it a dep (which
  // would re-fire on every dispatch). The signature deps gate re-parsing.
  const entryRef = useRef(entry);
  entryRef.current = entry;

  // Re-parse only when the source signature changes. Replay (sideEffectFree)
  // skips parsing: it renders from whatever the event stream already folded.
  useEffect(() => {
    if (runtime.sideEffectFree) return;
    if (sourceKind === 'preloaded') return; // nothing to parse; blocks preloaded
    // Idempotent: identical content already fully parsed → do nothing (no
    // requestKey bump, no `parsing` dispatch). This is the guard that, together
    // with the stable-signature deps, breaks the parse→re-render→re-parse loop.
    if (!shouldRequestParse(entryRef.current, signature)) return;

    const rk = ++requestKeyRef.current;
    logContentParsing({ runtime }, { key, requestKey: rk, sourceKind, blockSource, signature, provenance });

    let cancelled = false;
    const run = async () => {
      try {
        const { root, blocks, warnings } = await parseDeclaredSource(params);
        if (cancelled) return;
        logContentParsed({ runtime }, {
          key, requestKey: rk, sourceKind, blockSource, signature,
          root, warnings, blocks, provenance, retrievedAt: Date.now(),
        });
      } catch (err: any) {
        if (cancelled) return;
        logContentFailed({ runtime }, { key, requestKey: rk, error: err?.message || String(err) });
        onError?.(toAppError(err));
      }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (debounceMs > 0) {
      timer = setTimeout(run, debounceMs);
    } else {
      void run();
    }
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // Only the signature (source content) and a few primitives affect a parse;
    // params/runtime/provider are captured fresh each render on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, key, blockSource, sourceKind, debounceMs, runtime.sideEffectFree]);
  // Preloaded content (and the pre-first-parse window) falls back to the
  // requested id — its blocks are already in Redux.
  const fallbackRoot = sourceKind === 'preloaded' ? id : null;
  return deriveContentView(entry, fallbackRoot);
}
