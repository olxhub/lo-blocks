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
import { toLofsRef, type LofsCanonical } from '@/lib/types/address';
import { toAppError, type AppError } from '@/lib/types/errors';
import {
  contentKeyOf, sourceSignature, shouldRequestParse, deriveContentView, useContentEntry,
  logContentParsing, logContentParsed, logContentFailed, DEFAULT_PARSE_DEBOUNCE_MS,
  type ContentView,
} from '@/lib/state/content';
import type {
  ContentNamespace, DefinitionKey, IdMap, OLXLoadingError,
  ContentLedgerSourceKind, StateKey, RequestSeq,
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
  /** Debounce for RE-parsing during live editing (ms). The first parse of a
   *  source is never debounced. Defaults to DEFAULT_PARSE_DEBOUNCE_MS. */
  debounceMs?: number;
  /** Fatal parse error callback (canonical AppError). */
  onError?: (error: AppError) => void;
}

/**
 * External deps of a build: every file the parse actually READ through the
 * provider (each block's `parseDeps`), minus the files the build was parsed
 * FROM (each block's `source`).
 *
 * The subtraction is the whole point. An internal src= — one declared `files`
 * entry referencing another — is already covered by sourceSignature(), which
 * names every file in the map. Counting it as external would mark ordinary
 * multi-file inline content as provider-resolved and buy a mount re-parse for
 * nothing. What survives the subtraction is content the declared source cannot
 * see: companion files served by the provider stack.
 *
 * parseOLX's own top-level parseDeps array is never returned, so the union has
 * to be taken off the idMap, across every language variant of every block.
 */
function externalDepsOf(blocks: IdMap): LofsCanonical[] {
  const deps = new Set<string>();
  const sources = new Set<string>();
  for (const variants of Object.values(blocks)) {
    for (const node of Object.values(variants ?? {}) as any[]) {
      if (node?.source) sources.add(String(node.source));
      for (const dep of node?.parseDeps ?? []) deps.add(String(dep));
    }
  }
  return [...deps].filter(d => !sources.has(d)) as LofsCanonical[];
}

/** Parse the declared source into { root, blocks, warnings, deps }. */
async function parseDeclaredSource(
  params: UseContentParams,
): Promise<{ root: DefinitionKey | null; blocks: IdMap; warnings: OLXLoadingError[]; deps: LofsCanonical[] }> {
  const { inline, files, provider, provenance, ns } = params;
  if (!provider) throw new Error('RenderOLX: No provider for content resolution');

  if (inline != null && inline !== '') {
    const result = await parseOLX(inline, [toLofsRef(provenance || 'inline://')], provider, ns);
    return {
      root: (result.root || null) as DefinitionKey | null,
      blocks: result.idMap,
      warnings: result.errors || [],
      deps: externalDepsOf(result.idMap),
    };
  }

  // files
  let mergedIdMap: IdMap = {};
  let lastRoot: DefinitionKey | null = null;
  let allErrors: OLXLoadingError[] = [];
  // SORTED, to match sourceSignature(), which sorts filenames. Parsing in
  // insertion order while naming the source order-insensitively means two
  // inputs share a signature but produce different builds — later files set
  // `lastRoot` and overwrite duplicate ids — so the cached build can be for a
  // different tree than the one the name claims.
  for (const [filename, content] of Object.entries(files ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
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
  return { root: lastRoot, blocks: mergedIdMap, warnings: allErrors, deps: externalDepsOf(mergedIdMap) };
}

/**
 * Declare a content request and read its render view.
 *
 * The view is derived purely from Redux (the ledger entry + a preloaded-id
 * fallback). No local content/readiness state.
 */
export function useContent(params: UseContentParams): ContentView {
  const { ns, id, inline, files, provenance, blockSource, runtime, debounceMs = DEFAULT_PARSE_DEBOUNCE_MS, onError } = params;

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
  // Has the request effect fired yet for THIS hook instance? Only the first
  // fire may take the dep bypass below; see the comment there.
  const firedRef = useRef(false);

  // Re-parse only when the source signature changes. Replay (sideEffectFree)
  // skips parsing: it renders from whatever the event stream already folded.
  useEffect(() => {
    if (runtime.sideEffectFree) return;
    if (sourceKind === 'preloaded') return; // nothing to parse; blocks preloaded
    // Idempotent: identical content already fully parsed → do nothing (no
    // requestKey bump, no `parsing` dispatch). This is the guard that, together
    // with the stable-signature deps, breaks the parse→re-render→re-parse loop.
    // INTERIM — mount-scoped re-parse for provider-resolved content.
    //
    // The signature names the DECLARED source only, so a build that read
    // companion files through the provider stack (src= refs) has inputs the
    // idempotency guard cannot see: edit one and nothing re-parses (see the
    // KNOWN GAP note on sourceSignature). On main this was survivable because
    // the ledger was component-local and every remount re-parsed; now the
    // ledger outlives the component and a remount hits the guard, so stale is
    // forever. So: on the FIRST fire of a hook instance only, re-parse anyway
    // if the cached build recorded external deps — a fresh mount then picks up
    // their current bytes, which is exactly main's recovery behaviour, confined
    // to the builds that actually have companion files. The `firedRef` latch is
    // what keeps it mount-scoped: without it, the re-parse's own CONTENT_PARSED
    // re-fires nothing today, but any later effect fire would loop.
    //
    // The cost is honest: each such mount re-emits CONTENT_PARSED, blocks
    // payload and all, into the durable event stream. The dep gate is what
    // keeps that rare. The destination is comparing recorded dep VERSIONS
    // against the provider's current ones — a real staleness check, live rather
    // than mount-scoped — once the worktree lives in Redux.
    const depBypass = !firedRef.current
      && entryRef.current?.status === 'ready'
      && entryRef.current?.signature === signature
      && (entryRef.current?.data?.deps?.length ?? 0) > 0;
    firedRef.current = true;
    if (!depBypass && !shouldRequestParse(entryRef.current, signature)) return;

    let cancelled = false;
    const run = async () => {
      // The requestKey and the PARSING event are allocated HERE, after the
      // debounce has elapsed — not at schedule time. A superseded keystroke
      // never reaches this point, so it costs no event and no request key.
      // Seed from the LEDGER, not just this component's counter. The ref is
      // per-hook-instance and restarts at 0 on remount, while the entry
      // survives in Redux with the higher key from before. A remounted preview
      // would then emit request 1 against a ledger holding 5, CONTENT_PARSING
      // would keep 5, and the result would be rejected as stale — leaving the
      // preview stuck on an old build until the local counter caught up.
      // (Scaffolding either way: content addressing removes request keys.)
      const rk = (Math.max(requestKeyRef.current, entryRef.current?.requestKey ?? 0) + 1) as RequestSeq;
      requestKeyRef.current = rk;
      logContentParsing({ runtime }, { key, ns, requestKey: rk, sourceKind, blockSource, signature, provenance });
      try {
        const { root, blocks, warnings, deps } = await parseDeclaredSource(params);
        if (cancelled) return;
        logContentParsed({ runtime }, {
          key, ns, requestKey: rk, sourceKind, blockSource, signature,
          root, warnings, blocks, deps, provenance, retrievedAt: Date.now(),
        });
      } catch (err: any) {
        if (cancelled) return;
        logContentFailed({ runtime }, { key, requestKey: rk, error: err?.message || String(err) });
        onError?.(toAppError(err));
      }
    };

    // Debounce the PARSE, not the typing. Keystrokes are their own events on
    // their own path; what settles here is the comparatively expensive
    // parse-and-publish cycle, whose result is written to Redux on completion
    // so the render stays correct.
    //
    // Only a RE-parse waits. The first parse of a source runs immediately —
    // there is nothing on screen yet, so delaying it would just be a slower
    // first paint, and "settling" is meaningless before there is anything to
    // settle from.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isReparse = entryRef.current?.data != null;
    if (debounceMs > 0 && isReparse) {
      timer = setTimeout(run, debounceMs);
    } else {
      void run();
    }
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // Only the signature (source content) and a few primitives re-fire the
    // effect. params/runtime/provider are captured at effect-FIRE time, not
    // per render: `run` closes over the render in which the effect last fired,
    // so renders during a debounce window do not refresh them. Anything that
    // should trigger a re-capture must feed the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, key, blockSource, sourceKind, debounceMs, runtime.sideEffectFree]);
  // Preloaded content (and the pre-first-parse window) falls back to the
  // requested id — its blocks are already in Redux.
  const fallbackRoot = sourceKind === 'preloaded' ? id : null;
  // A request that WAS inline/files and is now preloaded must not keep
  // rendering the old locally-parsed build: the effect above returns early for
  // preloaded (nothing to parse), so the stale entry would win in
  // deriveContentView forever. Ignore an entry whose declared kind disagrees
  // with the current request and render the preloaded fallback instead.
  const staleKind = sourceKind === 'preloaded' && entry && entry.sourceKind !== 'preloaded';
  return deriveContentView(staleKind ? undefined : entry, fallbackRoot);
}
