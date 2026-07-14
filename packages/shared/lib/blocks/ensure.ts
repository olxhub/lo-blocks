// packages/shared/lib/blocks/ensure.ts
//
// ensureInstance — the ensure side of the instance pipeline.
//
// THE INVARIANT (see docs/fields-design.md): every rendered block
// instance enters through a hook; the hook ensures everything the
// instance needs; render() assumes readiness and fails fast. This
// module is the "ensures everything" part — one call, a list of LANES:
//
//   olxJson   the leaf definition's parsed content (+ its static kids
//             and referenced blocks — ensureBlock's existing behavior)
//   state     the instance's field state, by EXACT StateKey. Static
//             instances (StateKey = DefinitionKey) are resolved by the
//             content response bundling their state; dynamic instances
//             (scoped keys — only an ancestor's state enumerates them)
//             fetch through /api/fieldstate.
//   code      the block's implementation chunk. NOT YET A REAL LANE —
//             today every registered block's code ships with the app;
//             dynamic block loading (a course pulling in custom
//             interactives) slots in here without an API change.
//
// The state lane batches: every key ensured anywhere in one render pass
// coalesces into one request per MAX_KEYS_PER_FETCH chunk (microtask
// flush). Dedup and retry are the field ledger's job — a key is only
// fetched when its freshness reads 'unknown', and a failed key becomes
// eligible again per the ledger's declarative backoff (fieldLedger.ts).
//
// NOT hooks — safe from effects, callbacks, event handlers. Never call
// from render functions or selectors.

import { fetchFieldState, fetchOlxJson } from '@/lib/content/fetchOlxJson';
import { adoptFieldState } from '@/lib/state/store';
import {
  selectFieldFreshness,
  FIELDSTATE_LOADING, FIELDSTATE_ERROR, STATE_RETRY,
  type FreshnessPolicy,
} from '@/lib/state/fieldLedger';
import {
  selectBlockState,
  dispatchOlxJsonLoading,
  dispatchOlxJson,
  dispatchOlxJsonError,
  contentFreshness,
  CONTENT_RETRY,
} from '@/lib/state/olxjson';
import { getRefAttributes } from '@/lib/blocks/attributeSchemas';
import {
  leafDefinitionKeyFromStateKey, qualifyDefinitionRef,
  allDefinitionKeysFromStateKey, stateKeyForGlobalRef, parseAnyStateRef,
} from '@/lib/types/id-grammar';
import type { StateKey } from '@/lib/types/id-grammar';
import { getActorId } from '@/lib/crdt/actorId';
import { backoffMs } from '@/lib/util/async';
import type { BaselineProps, RuntimeProps, OlxJson, IdMap, DefinitionKey, DefinitionRef } from '@/lib/types';

export type Lane = 'olxJson' | 'state' | 'code';
const ALL_LANES: Lane[] = ['olxJson', 'state', 'code'];

/** /api/fieldstate's MAX_KEYS is 256; stay comfortably under it. */
const MAX_KEYS_PER_FETCH = 200;

// ── State-lane batching ─────────────────────────────────────────────────────
// One pending set per module: every ensureInstance in a render pass adds
// keys; the first add schedules a microtask flush. The store rides along
// (one app, one store — captured from the first caller of the batch).

let pendingKeys = new Set<StateKey>();
let pendingStore: { getState(): any; dispatch(action: any): void } | null = null;
let flushScheduled = false;

// retry-wait targets with a wake-up timer already scheduled. Both lanes
// share ONE map, keyed by a namespaced string (`state:${key}` vs
// `olx:${source}:${definitionKey}`) so a content retry and a state retry
// for the same underlying id never collide.
const scheduledRetries = new Map<string, ReturnType<typeof setTimeout>>();

/** Arm a one-shot wake-up for a retry-wait target: when its backoff
 * elapses, re-ensure. The ledger recomputes eligibility on wake, so a
 * spurious early fire is harmless. Idempotent per timerKey. */
function scheduleWake(timerKey: string, eligibleAt: number, fn: () => void) {
  if (scheduledRetries.has(timerKey)) return;
  const timer = setTimeout(() => {
    scheduledRetries.delete(timerKey);
    fn();
  }, Math.max(0, eligibleAt - Date.now()));
  (timer as any).unref?.(); // never hold a test/node process open
  scheduledRetries.set(timerKey, timer);
}

/**
 * Ensure a set of block instances are loading everything they need.
 * Idempotent and cheap to over-call: each lane consults its ledger and
 * only acts on keys that are genuinely unresolved.
 */
export function ensureInstance(
  props: RuntimeProps,
  stateKeys: StateKey[],
  { lanes = ALL_LANES, policy }: { lanes?: Lane[]; policy?: FreshnessPolicy } = {},
): void {
  if (props.runtime.sideEffectFree || stateKeys.length === 0) return;
  const source = props.runtime.olxJsonSources?.[0] ?? 'content';

  if (lanes.includes('olxJson')) {
    for (const key of stateKeys) {
      ensureBlock(props, leafDefinitionKeyFromStateKey(key), source);
    }
  }

  if (lanes.includes('state')) {
    const state = props.runtime.store.getState();
    for (const key of stateKeys) {
      switch (selectFieldFreshness(state, key, { policy })) {
        case 'unknown':
          enqueueStateFetch(props, key);
          break;
        case 'retry-wait':
          scheduleRetry(props, key, { policy });
          break;
        // 'ready', 'pending', 'failed': nothing to do — failed keys
        // surface through the hook layer's error placeholder.
      }
    }
  }

  // 'code' lane: no-op until dynamic block loading exists (see header).
}

function enqueueStateFetch(props: RuntimeProps, key: StateKey) {
  pendingKeys.add(key);
  pendingStore ??= props.runtime.store;
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushStateFetches);
  }
}

function scheduleRetry(
  props: RuntimeProps,
  key: StateKey,
  opts: { policy?: FreshnessPolicy },
) {
  const entry = props.runtime.store.getState()?.application_state?.fieldLedger?.[key];
  const attempt = entry?.attempt;
  if (!attempt) return;
  const eligibleAt = (attempt.lastFailureAt ?? attempt.startedAt)
    + backoffMs(STATE_RETRY, attempt.failures);
  scheduleWake(`state:${key}`, eligibleAt, () =>
    ensureInstance(props, [key], { lanes: ['state'], ...opts }));
}

async function flushStateFetches() {
  flushScheduled = false;
  const store = pendingStore;
  const keys = [...pendingKeys];
  pendingKeys = new Set();
  pendingStore = null;
  if (!store || keys.length === 0) return;

  for (let i = 0; i < keys.length; i += MAX_KEYS_PER_FETCH) {
    const chunk = keys.slice(i, i + MAX_KEYS_PER_FETCH);
    dispatchLedger(store, FIELDSTATE_LOADING, chunk);
    try {
      const data = await fetchFieldState(chunk);
      if (!data.ok) {
        dispatchLedger(store, FIELDSTATE_ERROR, chunk, data.error);
        continue;
      }
      // The response covers every requested key (buckets or confirmed
      // absence) — adopt + resolve the whole chunk in one dispatch.
      adoptFieldState(data.fieldState, chunk);
    } catch (err: any) {
      dispatchLedger(store, FIELDSTATE_ERROR, chunk, err?.message ?? 'network failure');
    }
  }
}

/** Ledger events are fetch bookkeeping, not learner activity: dispatched
 * directly on the store (never logEvent), so they stay out of the event
 * log, the wire, and the server materialization. */
function dispatchLedger(
  store: { dispatch(action: any): void },
  type: string,
  keys: StateKey[],
  error?: string,
) {
  store.dispatch({
    redux_type: 'EMIT_EVENT',
    type,
    payload: JSON.stringify({
      event: type, keys, at: Date.now(), loadGuid: getActorId(),
      ...(error !== undefined ? { error } : {}),
    }),
    __fromServer: true,
  });
}

// ── olxJson (content) lane ───────────────────────────────────────────────────
// ensureBlock is the content lane's ensure entry point (the state lane's
// sibling of enqueueStateFetch). Dedup and retry are the content ledger's
// job — a block is fetched only when contentFreshness reads 'unknown', a
// transient failure becomes eligible again on CONTENT_RETRY's backoff, and
// a fatal failure (the server answered "no") never retries.

/**
 * Ensure a block's OlxJson is loading into Redux.
 *
 * Consults the content ledger via contentFreshness(entry, locale):
 *   unknown    → dispatch OLXJSON_LOADING and fetch (profile = locale)
 *   retry-wait → arm a wake-up; re-ensures when the backoff elapses
 *   pending / ready / failed → no-op
 *
 * The `locale` is the REQUEST PROFILE (what we send to the server, which
 * may negotiate a different content variant back). Currently the only
 * profile dimension is locale, but this will grow (bandwidth, a11y,
 * explicit overrides) — all fed into one negotiation, CSS-cascade style.
 * A resolution under a different profile reads not-ready, so a locale
 * change refetches (LOAD_OLXJSON merges variants — nothing is lost).
 *
 * After a successful fetch, scans loaded blocks for ref-typed attributes
 * (getRefAttributes) and recursively ensures their targets — this breaks
 * the Ref deadlock (Ref loads itself, but nobody loads its target).
 *
 * NOT a hook — safe from effects, callbacks, event handlers. Do NOT call
 * from render functions or Redux selectors.
 */
export function ensureBlock(
  props: BaselineProps,
  id: string | DefinitionRef | null | undefined,
  source: string = 'content'
): void {
  if (!id || props.runtime.sideEffectFree) return;

  const definitionKey: DefinitionKey = qualifyDefinitionRef(id as DefinitionRef, props.runtime.ns);
  const locale = props.runtime.locale.code;
  const state = props.runtime.store.getState();
  const entry = selectBlockState(state, [source], definitionKey);

  switch (contentFreshness(entry, locale)) {
    case 'unknown':
      break; // fall through to fetch
    case 'retry-wait': {
      const attempt = entry?.ledger?.attempt;
      if (attempt) {
        const eligibleAt = (attempt.lastFailureAt ?? attempt.startedAt)
          + backoffMs(CONTENT_RETRY, attempt.failures);
        scheduleWake(`olx:${source}:${definitionKey}`, eligibleAt,
          () => ensureBlock(props, id, source));
      }
      return;
    }
    default:
      // 'pending' | 'ready' | 'failed' — nothing to do. A fatal failure
      // stays 'failed' forever (the server said no); the hook layer
      // surfaces it as an error placeholder.
      return;
  }

  dispatchOlxJsonLoading(props, source, definitionKey, locale);

  fetchOlxJson(definitionKey, {
      headers: { 'Accept-Language': locale },
    })
    .then(data => {
      if (!data.ok) {
        // API error (404 missing content, 500 server error): the server
        // answered — retrying is pointless. Record a FATAL fact; the
        // ledger keeps freshness at 'failed' forever this page load.
        dispatchOlxJsonError(props, source, definitionKey, data.error || `Failed to load ${definitionKey}`, true);
      } else {
        // Field state rides the content response (fields-design 2b):
        // adopt BEFORE the content dispatch so blocks never render from
        // defaults and then flicker to saved state. The served
        // definitions are the response's state COVERAGE — for static
        // blocks StateKey = DefinitionKey, so the field ledger marks
        // them resolved here and the state lane never refetches them
        // (dynamic scoped instances go through ensureInstance instead).
        adoptFieldState(data.fieldState, Object.keys(data.idMap));
        dispatchOlxJson(props, source, data.idMap, locale);
        // Recursively ensure blocks referenced by ref-typed attributes
        ensureReferencedBlocks(props, data.idMap, source);
      }
    })
    .catch(err => {
      // Network failure — a TRANSIENT fact (not fatal). The ledger's
      // backoff makes the key eligible again, and the next ensureBlock
      // (hook re-render or scheduled wake) refetches. No dedup set to
      // untangle: the old reload-only-retry bug is gone with ensuredIds.
      dispatchOlxJsonError(props, source, definitionKey, err.message || `Failed to load ${definitionKey}`, false);
    });
}

/**
 * Scan loaded blocks for ref-typed attributes and ensure their targets.
 *
 * Which attributes to scan comes from each block's zod schema — any
 * attribute tagged with a ref extractor (z_stateRef, z_stateRefList,
 * z_blockFieldRef, z_blockFieldRefList) is discovered via getRefAttributes().
 *
 * Called after a successful fetch. The idMap has the fetched block plus its
 * static kids; we scan all of them. Handles absolute refs (/foo) and scoped
 * keys (myList:#0:answer → ensures both myList and answer). Recursive: a
 * referenced block's own refs get ensured when it loads.
 */
function ensureReferencedBlocks(props: BaselineProps, idMap: IdMap, source: string): void {
  const blockRegistry = props.runtime.blockRegistry ?? {};
  for (const variantMap of Object.values(idMap)) {
    // Check any variant — refs don't change across languages
    const anyVariant = Object.values(variantMap)[0] as OlxJson | undefined;
    if (!anyVariant?.tag) continue;

    const block = blockRegistry[anyVariant.tag];
    const refAttrs = block?.attributes ? getRefAttributes(block.attributes) : [];

    for (const { name, extractRefs } of refAttrs) {
      const refValue = anyVariant.attributes?.[name];
      if (refValue == null) continue;

      const refs = extractRefs(refValue);
      for (const ref of refs) {
        // extractRefs returns Zod-validated values — may include system-generated
        // _-prefixed bare refs since z_stateRef uses the permissive validator.
        const qualifiedKey = stateKeyForGlobalRef(parseAnyStateRef(ref), props.runtime.ns);
        for (const defKey of allDefinitionKeysFromStateKey(qualifiedKey)) {
          // Skip blocks already in this idMap — they were just dispatched
          // in the same LOAD_OLXJSON event. Calling ensureBlock here would
          // race: OLXJSON_LOADING enqueued AFTER LOAD_OLXJSON overwrites
          // the block's resolved ledger back to an in-flight attempt.
          if (idMap[defKey]) continue;
          ensureBlock(props, defKey, source);
        }
      }
    }
  }
}

/** Test hook: drop batch + retry bookkeeping between cases. */
export function resetEnsureForTests() {
  pendingKeys = new Set();
  pendingStore = null;
  flushScheduled = false;
  for (const timer of scheduledRetries.values()) clearTimeout(timer);
  scheduledRetries.clear();
}
