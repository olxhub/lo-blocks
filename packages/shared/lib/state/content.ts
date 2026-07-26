// packages/shared/lib/state/content.ts
//
// Content ledger — the source-level parse lifecycle for OLX content.
//
// WHY THIS EXISTS
// ---------------
// The OlxJson slice (lib/state/olxjson.ts) is BLOCK-level: it stores individual
// blocks keyed by DefinitionKey, with no notion of "this whole content request
// is loading / ready / failed", no root id, no request identity. That gap is
// exactly why RenderOLX used to keep local React state (`parsed`, `fatalError`,
// `warnings`, `parsingPending`) and flip a synchronous "I'm ready" flag that
// raced the ASYNC block dispatch into Redux — the bug the durable IndexedDB
// queue exposed.
//
// The ledger closes that gap. One entry per content REQUEST, holding:
//   - the source-level lifecycle (parsing / ready / error),
//   - a supersede key (stale results are rejected by the reducer),
//   - the declared source kind (inline / files / preloaded — the fetch decision
//     is made HERE, at request time, never guessed at read time),
//   - the small amount of derived data RenderOLX renders from (root + warnings),
//     kept as the LAST-VALID build so live editing never flashes.
//
// ATOMIC LAND
// -----------
// The block DATA still lives in the OlxJson slice. A single CONTENT_PARSED event
// lands BOTH slices in one reducer fold (see store.ts routing + the CONTENT_PARSED
// case in olxjson.ts). So the moment the ledger reports a root, that root's
// blocks are guaranteed to already be in Redux. "Ready" (ledger) and "content in
// Redux" (blocks) can no longer disagree — the race is structurally impossible.
//
// WHERE THIS IS GOING (read before "fixing" the INTERIM bits)
// -----------------------------------------------------------
// OLX -> OlxJson is a MAJOR transformation, and it is becoming two-stage:
// PARSE, then LINK. The right mental model is a compiler with an incremental
// linker, not a file converter — the source-to-output mapping is no more 1:1
// than hello.cpp -> hello.exe while hellolib.cpp -> hellolib.so.
//
// OLX lives in repos. Every id in every file lands in OlxJson under
// `namespace:id`, and two overlapping `namespace:id` pairs are a CONFLICT — by
// design, not by accident. A fork keeps the namespace it forked, so two forks
// of one course (a) cannot both load into a single renderer, and (b) share
// state keys: a student who learned a topic under one fork still has it learned
// under the other. That is intended. A fork wanting otherwise renames its
// namespace. NOTE: namespace != repo. One repo may hold many namespaces, one
// namespace may span repos; the repo name is only the DEFAULT when none given.
//
// Storage goes git-style two-level: a bare tree, with a WORKING TREE shadowing
// it — eventually in redux / the CRDT shared between client and server. Two
// names, never conflated (grammar in types/address.ts):
//   (a) what you ASK for — LofsRef, may be mutable/ambiguous
//   (b) what you GOT     — LofsCanonical, immutable, identifies exact bytes
// (b) usually works as an (a) but NOT always: bytes you read stay meaningful
// after the file they came from changes or is deleted. The question worth
// answering is always "does the read name still point to the same canonical?" —
// it decides whether to refresh, whether a cached parse is valid, and whether
// we would overwrite without a lease. So reads always return the canonical.
//
// SHADOWING ALREADY EXISTS, one layer down: StackedStorageProvider, which
// useBuildProviderStack assembles with inline/files stacked in front of the
// fetchable providers — a working tree in front of a bare tree. Absent blocks
// should resolve THROUGH that resolution layer: an unresolved symbol is a
// linker question, answered against the link inputs, never guessed from an
// absent read. (The stack itself is transitional — source resolution is moving
// to the worktree model above — but the LAYER is the right one either way.)
// Do not build a second shadowing mechanism at the block-source layer: that was
// tried in this branch and reverted. One shadowing mechanism at the wrong layer
// is worse than none.
//
// SCAFFOLDING here, to delete rather than grow:
//   * `requestKey` (RequestSeq) — hand-rolled ordering, needed only because
//     builds are not yet stored under a content name. Under content addressing
//     a late parse writes to its own address and cannot clobber, so "which
//     result wins" stops being a comparison and becomes a pointer move.
//   * `isLocalBlockSource` — an approximation standing in for resolution
//     through the provider stack (see its own comment).
//   * `digest()` — a weak content name, fine while compared for EQUALITY only.
//     Must become a real hash before anything is STORED or SERVED under it.
//
// What should survive: the two-name discipline, and the canonical name riding
// on the rendered build (`ContentLedgerData.canonical`).
//
'use client';

import { useSelector } from 'react-redux';
import type {
  ContentLedgerEntry, ContentLedgerState, ContentLedgerSourceKind,
  ContentRequestKey, BlockSource, RequestSeq,
  DefinitionKey, IdMap, OLXLoadingError, RootState,
} from '../types';
import type { LofsCanonical, LofsContentPath, LofsRef, LofsVersion } from '../types/address';
import {
  makeAddress, toLofsCanonical, toLofsContentPath, toLofsOrigin, toLofsVersion,
} from '../types/address';
import type { LogEventFn } from '../player/client/render';

// =============================================================================
// Event types
// =============================================================================

export const CONTENT_PARSING = 'CONTENT_PARSING';
export const CONTENT_PARSED = 'CONTENT_PARSED';
export const CONTENT_FAILED = 'CONTENT_FAILED';
export const CONTENT_RENDER_FAILED = 'CONTENT_RENDER_FAILED';

export const CONTENT_EVENT_TYPES = [
  CONTENT_PARSING, CONTENT_PARSED, CONTENT_FAILED, CONTENT_RENDER_FAILED,
];

/**
 * How long a live-edited source must settle before we re-parse it (ms).
 *
 * DEBOUNCE THE PARSE, NOT THE TYPING. Keystrokes are their own events on their
 * own path and stay per-keystroke — that granularity is the product. What waits
 * here is the parse-and-publish cycle: re-reading the whole source, and writing
 * the result durably. At 0 that ran once per keystroke, so typing a sentence
 * published a stack of permanent records of half-typed documents.
 *
 * Only a RE-parse waits (see useContent) — the first parse is immediate, since
 * delaying it would only slow the first paint.
 */
export const DEFAULT_PARSE_DEBOUNCE_MS = 500;

// =============================================================================
// Content key — stable per-request identity
// =============================================================================

/**
 * Build the ledger key for a content request. Stable across keystrokes (the
 * inline text changes, but blockSource + ns + id do not) so the last-valid
 * `data` snapshot survives live editing. The parts are JSON-encoded into an
 * array literal, so the encoding is collision-safe regardless of the parts'
 * contents. The key is opaque — only ever a Record key, never parsed back apart.
 */
export function contentKeyOf(blockSource: string, ns: string, id: string): ContentRequestKey {
  return JSON.stringify([blockSource, ns, id]) as ContentRequestKey;
}

// =============================================================================
// Declared-source gate (INTERIM)
// =============================================================================

/**
 * INTERIM. May this block-source be server-fetched, or is it LOCAL content
 * produced by local parsing (where an absent block is genuinely missing, not
 * "go fetch")? This is what stops inline content 404ing.
 *
 * WHY THIS IS A SCAN, AND WHY IT STAYS ONE FOR NOW. Given a block there is no
 * back-pointer to the request that produced it (no reverse index), so this can
 * only answer an approximation. It is scoped to (blockSource, ns) rather than
 * the whole block-source, which bounds the damage: previously ONE inline render
 * turned off fetch-on-missing for an entire block-source for the rest of the
 * session, silently breaking real content that needed fetching.
 *
 * THE DESTINATION IS NOT A BETTER GATE. Shadowing already exists one layer
 * down, in StackedStorageProvider — inline/files content is stacked in front of
 * the fetchable providers, which is precisely a working tree in front of a bare
 * tree. The 404 happens because ensureBlock fetches by DefinitionKey straight
 * from the server, going AROUND that stack. The fix is to resolve absent blocks
 * THROUGH the provider stack (git-style two level: a bare tree, with a working
 * tree shadowing it, eventually living in redux/the CRDT shared between client
 * and server), at which point this predicate has nothing left to decide.
 *
 * Do not grow this into a second shadowing mechanism — that was tried, and one
 * shadowing mechanism at the wrong layer is worse than none.
 */
export function isLocalBlockSource(state: RootState, blockSource: string, ns?: string): boolean {
  const content = state.application_state?.content;
  if (!content) return false;
  for (const [key, entry] of Object.entries(content)) {
    if (entry.blockSource !== blockSource) continue;
    if (entry.sourceKind !== 'inline' && entry.sourceKind !== 'files') continue;
    // The ledger key encodes [blockSource, ns, id]; compare ns when we know it.
    if (ns != null) {
      try { if (JSON.parse(key)[1] !== ns) continue; } catch { /* opaque key */ }
    }
    return true;
  }
  return false;
}

/**
 * Content digest — a weak content name for a source string.
 *
 * INTERIM STRENGTH. This is the `#version` of a canonical ref (see
 * types/address.ts), and today it is compared for EQUALITY ONLY, where a
 * collision costs a skipped re-parse (a stale render) and nothing worse. The
 * day these become true content ADDRESSES — the thing content is stored and
 * served under — a collision would serve the WRONG CONTENT, and this must
 * become a real hash (`LofsContentHash`, SHA-256). Note the constraint that
 * will make that non-trivial: `crypto.subtle` is async, and this sits on a
 * synchronous render path.
 *
 * FNV-1a, seeded twice, paired with the exact length. Same trade LOFS makes
 * with mtime/size: a cheap canonical stamp instead of hashing every read.
 */
function digest(text: string): LofsVersion {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  return toLofsVersion(`${text.length}.${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`);
}

/**
 * (b) The CANONICAL name of the source a request will parse — "what we got",
 * as a resolved LOFS ref: `<origin>://<path>#<content-version>`.
 *
 * Derived from the values that determine the parse RESULT (inline text, file
 * contents, ids) and NOT from object identity, so two renders of identical
 * content produce the same name and the request effect re-fires only on a real
 * content change — never on a fresh `files`/`provider` object from a re-render.
 * That is what breaks the dispatch → re-render → re-fire loop.
 *
 * Answers the question the ledger exists to ask: *does the read name still
 * point to the same canonical?* Equality here means "nothing moved".
 *
 * Bulk source is digested into the `#version`; the identifying parts stay
 * legible, because a canonical name you can read in an event log is worth far
 * more than the bytes it saves. Multiple files hash their per-file canonicals
 * into one name — git's tree object, in miniature.
 */
/**
 * Escape a value for use as the PATH component of a canonical name.
 *
 * "#" is LOFS's version delimiter, so paths forbid it — while the values we
 * put there legitimately contain it: scoped StateKeys look like `list:#3:answer`,
 * and a canonical provenance is `source://path#version` by construction.
 * Passing either through raw threw synchronously from sourceSignature, i.e.
 * during render, before any component error handling could see it.
 *
 * Percent-escaping keeps the name legible (the point of not digesting these
 * parts) while satisfying the grammar. The result is compared and grepped,
 * never parsed apart, so the escaping never has to be undone.
 *
 * "%" is escaped FIRST so the encoding is injective: escaping only "#" maps
 * both `a#b` and a literal `a%23b` to the same name, and two inputs sharing a
 * canonical name is precisely the integrity property this is for — equal names
 * make shouldRequestParse skip a re-parse that was actually required.
 */
function pathPart(value: string): LofsContentPath {
  return toLofsContentPath(value.replace(/%/g, '%25').replace(/#/g, '%23'));
}

export function sourceSignature(input: {
  sourceKind: ContentLedgerSourceKind;
  ns: string;
  id: string;
  inline?: string;
  files?: Record<string, string>;
  provenance?: string;
}): LofsCanonical {
  const { sourceKind, ns, id, inline, files, provenance } = input;
  const origin = toLofsOrigin(provenance ? `draft:${ns}` : `memory:${ns}`);

  if (sourceKind === 'inline') {
    const path = pathPart(provenance || '_inline.olx');
    return toLofsCanonical(makeAddress(origin, path, digest(inline ?? '')));
  }
  if (sourceKind === 'files') {
    // One canonical per file, in a stable order, hashed into a tree name.
    const names = Object.keys(files ?? {}).sort()
      .map(k => `${k}#${digest(files![k])}`).join('\n');
    const path = pathPart(provenance || '_files');
    return toLofsCanonical(makeAddress(origin, path, digest(names)));
  }
  // Preloaded: the blocks are already in Redux; the id IS the whole name.
  return toLofsCanonical(makeAddress(origin, pathPart(id), toLofsVersion('preloaded')));
}

/**
 * Idempotency guard: should the request effect kick a fresh parse for this
 * signature? No only when the entry is already `ready` for the SAME signature —
 * i.e. we have already fully parsed exactly this content. A `parsing`/`error`
 * entry (or a different/absent signature) still parses, so a lost or superseded
 * in-flight parse is never mistaken for a completed one.
 */
export function shouldRequestParse(entry: ContentLedgerEntry | undefined, signature: string): boolean {
  return !(entry && entry.status === 'ready' && entry.signature === signature);
}

// =============================================================================
// Dispatch helpers (all through the normal logEvent path — replayable)
// =============================================================================

type LogProps = { runtime: { logEvent: LogEventFn } };

export function logContentParsing(
  props: LogProps,
  payload: { key: string; requestKey: number; sourceKind: ContentLedgerSourceKind; blockSource: string; signature: string; provenance?: string },
): void {
  props.runtime.logEvent(CONTENT_PARSING, payload);
}

/**
 * OPEN QUESTION — parsed content on the wire (deliberate today, not settled).
 *
 * `blocks` puts a parsed source (a page-level subset, never the whole course)
 * into the durable event stream, which reads like a violation of "don't route
 * bulk content through events" (docs/README.md, invariant 7). It is here
 * because reconstruction and meaningful analytics need it — a replay has to be
 * able to show what the student actually saw. That requirement is real and is
 * not the part up for debate.
 *
 * HOW it should be served is genuinely open. Content is fetched over the API
 * and then also travels over the websocket, which is redundant; and pushing
 * content back out over the OUTGOING socket is, frankly, a bit silly. Current
 * leaning is websocket, but that is not settled. Treat this shape as a known
 * future cleanup, not as precedent for routing other bulk payloads through
 * events.
 */
export function logContentParsed(
  props: LogProps,
  payload: {
    key: string; requestKey: number; sourceKind: ContentLedgerSourceKind; blockSource: string; signature: string;
    root: DefinitionKey | null; warnings: OLXLoadingError[]; blocks: IdMap;
    provenance?: string; retrievedAt: number;
  },
): void {
  props.runtime.logEvent(CONTENT_PARSED, payload);
}

export function logContentFailed(
  props: LogProps,
  payload: { key: string; requestKey: number; error: string },
): void {
  props.runtime.logEvent(CONTENT_FAILED, { ...payload, error: { message: payload.error } });
}

export function logContentRenderFailed(
  props: LogProps,
  payload: { key: string; id: string; title?: string; message: string; technical?: string },
): void {
  props.runtime.logEvent(CONTENT_RENDER_FAILED, payload);
}

// =============================================================================
// Reducer
// =============================================================================

export const initialContentState: ContentLedgerState = {};

/** True when `incoming` is an older attempt than what the entry already holds. */
function superseded(entry: ContentLedgerEntry | undefined, incomingRequestKey: number): boolean {
  return !!entry && incomingRequestKey < entry.requestKey;
}

/**
 * INTERIM — see "WHERE THIS IS GOING" in this file's header.
 *
 * Is this content event a stale (superseded) result?
 *
 * CONTENT_PARSED lands TWO slices in one fold — the ledger here, the blocks in
 * olxjson.ts. Both must make the SAME accept/reject decision, so the decision is
 * made ONCE, by the store's routing, using this predicate (see store.ts). Asking
 * each reducer to decide independently is what let a stale parse be rejected by
 * the ledger and merged into the blocks anyway — the exact disagreement
 * atomic-land exists to make impossible.
 *
 * Only *results* can be stale. CONTENT_PARSING carries no data and only ratchets
 * requestKey forward, and CONTENT_RENDER_FAILED describes the build currently on
 * screen rather than a parse attempt, so neither is filtered here.
 */
export function isSupersededContentEvent(
  state: ContentLedgerState = initialContentState,
  action: any,
): boolean {
  if (action?.type !== CONTENT_PARSED && action?.type !== CONTENT_FAILED) return false;
  if (!action.key) return false;
  return superseded(state?.[action.key], action.requestKey);
}

export function contentReducer(
  state: ContentLedgerState = initialContentState,
  action: any,
): ContentLedgerState {
  switch (action.type) {
    case CONTENT_PARSING: {
      const { key, requestKey, sourceKind, blockSource, signature, provenance } = action;
      if (!key) return state;
      const entry = state[key];
      // A newer build is in flight. Keep `data` (last valid) so we keep
      // rendering it; clear transient error/renderError for the fresh attempt.
      return {
        ...state,
        [key]: {
          ...entry,
          status: 'parsing',
          requestKey: Math.max(entry?.requestKey ?? 0, requestKey),
          sourceKind,
          blockSource,
          signature,
          provenance,
          error: undefined,
          renderError: undefined,
        },
      };
    }

    case CONTENT_PARSED: {
      const { key, requestKey, sourceKind, blockSource, signature, root, warnings, provenance, retrievedAt } = action;
      if (!key) return state;
      const entry = state[key];
      if (superseded(entry, requestKey)) return state; // stale result — reject
      // Swap in the new build. `data` is replaced ONLY here (success), so it is
      // always the last-valid render. Blocks land in the OlxJson slice via the
      // CONTENT_PARSED case in olxjson.ts, folded from the SAME event.
      return {
        ...state,
        [key]: {
          status: 'ready',
          requestKey: Math.max(entry?.requestKey ?? 0, requestKey),
          sourceKind,
          blockSource,
          signature,
          data: { root: root ?? null, warnings: warnings ?? [], canonical: signature },
          provenance,
          retrievedAt,
        },
      };
    }

    case CONTENT_FAILED: {
      const { key, requestKey, error } = action;
      if (!key) return state;
      const entry = state[key];
      if (superseded(entry, requestKey)) return state; // stale failure — reject
      // Keep `data` (last valid) so a mid-typing parse error does not blank the
      // screen. RenderOLX surfaces the error gently when `data` is present.
      return {
        ...state,
        [key]: {
          ...entry,
          status: 'error',
          requestKey: Math.max(entry?.requestKey ?? 0, requestKey),
          sourceKind: entry?.sourceKind ?? 'inline',
          blockSource: entry?.blockSource ?? '',
          error: { message: error?.message || String(error) },
        },
      };
    }

    case CONTENT_RENDER_FAILED: {
      const { key, id, title, message, technical } = action;
      if (!key) return state;
      const entry = state[key];
      // Record the render-time exception as ordinary, replayable state (no
      // synthetic OLX node, no synchronous dispatch). Not persisted-derived: it
      // reconstructs away once the underlying block bug is fixed.
      return {
        ...state,
        [key]: {
          ...(entry ?? { status: 'ready', requestKey: 0, sourceKind: 'inline', blockSource: '' }),
          renderError: { id, title, message, technical },
        },
      };
    }

    default:
      return state;
  }
}

// =============================================================================
// Selectors
// =============================================================================

export function selectContentEntry(state: RootState, key: string): ContentLedgerEntry | undefined {
  return state.application_state?.content?.[key];
}


// =============================================================================
// Rendering view — pure derivation from a ledger entry
// =============================================================================

export interface ContentView {
  /** Root to render (a parsed DefinitionKey, or the requested StateKey fallback
   *  for preloaded content). null = nothing renderable. */
  root: string | null;
  /** Something renderable is available (last-valid build or preloaded id). */
  ready: boolean;
  /** A newer build is in flight (parsing) or the latest parse errored — show a
   *  gentle "updating"/error marker, but keep rendering `root`. */
  updating: boolean;
  /** Non-fatal parse warnings for the current render. */
  warnings: OLXLoadingError[];
  /** Error message, or null. When `fatal`, there is nothing to render. */
  error: string | null;
  /** True when the error is fatal (no last-valid build) — RenderOLX shows
   *  DisplayError instead of content. */
  fatal: boolean;
  /** Render-time exception recorded by the ErrorBoundary, if any. */
  renderError?: ContentLedgerEntry['renderError'];
  /** (b) CANONICAL name of the build currently being rendered — the identity of
   *  the bytes behind `root`, not of the request that asked for them.
   *
   *  This is the render-reset seam. React needs to know "is this a DIFFERENT
   *  build?" to drop an ErrorBoundary's latched failure, and `root` cannot
   *  answer: editing a block's contents fixes the error while leaving the root
   *  id identical, so a boundary keyed on root stays stuck on a stale failure
   *  forever. Keyed on the canonical name it resets exactly when the content
   *  actually changed.
   *
   *  Undefined until the first successful build. Stable interface: today the
   *  digest-versioned ref, later the content hash — consumers compare it for
   *  equality either way and never change. */
  revision?: LofsCanonical;
}

/**
 * Derive the render view from a ledger entry.
 *
 * `fallbackRoot` is the id to render when there is no parse (preloaded content:
 * blocks are already in Redux, the ledger only tracks readiness) — or before
 * the first parse lands.
 *
 * The last-valid policy lives HERE, as one pure function, instead of being
 * scattered across component state: while a re-parse is in flight or has just
 * failed, we keep returning the previous `data` (last-valid build) so the
 * screen never blanks or flashes.
 */
export function deriveContentView(
  entry: ContentLedgerEntry | undefined,
  fallbackRoot: string | null,
): ContentView {
  if (!entry) {
    // Nobody has parsed for this key. Preloaded content renders its fallback
    // root immediately; otherwise we are still waiting for the first parse.
    if (fallbackRoot != null) {
      return { root: fallbackRoot, ready: true, updating: false, warnings: [], error: null, fatal: false };
    }
    return { root: null, ready: false, updating: true, warnings: [], error: null, fatal: false };
  }

  const data = entry.data;
  const warnings = data?.warnings ?? [];
  const renderError = entry.renderError;

  if (entry.status === 'ready') {
    // The parse succeeded — ready even if it produced an empty root (RenderOLX
    // then falls back to the requested id, matching pre-ledger behavior).
    const root = data?.root ?? fallbackRoot;
    return { root, ready: true, updating: false, warnings, error: null, fatal: false, renderError, revision: data?.canonical };
  }

  if (entry.status === 'parsing') {
    if (data) {
      // Keep showing the last-valid build while the new one parses.
      return { root: data.root, ready: data.root != null, updating: true, warnings, error: null, fatal: false, renderError, revision: data.canonical };
    }
    const root = fallbackRoot;
    return { root, ready: root != null, updating: true, warnings, error: null, fatal: false, renderError };
  }

  // status === 'error'
  const message = entry.error?.message ?? 'Content failed to load';
  if (data) {
    // Mid-typing parse error: keep the last-valid render, surface error gently.
    return { root: data.root, ready: data.root != null, updating: true, warnings, error: message, fatal: false, renderError, revision: data.canonical };
  }
  const root = fallbackRoot;
  if (root != null) {
    return { root, ready: true, updating: false, warnings, error: message, fatal: false, renderError };
  }
  return { root: null, ready: false, updating: false, warnings, error: message, fatal: true, renderError };
}

// =============================================================================
// Hooks
// =============================================================================

/** Read a ledger entry reactively. */
export function useContentEntry(key: string): ContentLedgerEntry | undefined {
  return useSelector((state: RootState) => selectContentEntry(state, key));
}
