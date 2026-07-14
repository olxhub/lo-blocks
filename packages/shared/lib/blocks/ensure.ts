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

import { fetchFieldState } from '@/lib/content/fetchOlxJson';
import { adoptFieldState } from '@/lib/state/store';
import {
  selectFieldFreshness,
  FIELDSTATE_LOADING, FIELDSTATE_ERROR, STATE_RETRY,
  type FreshnessPolicy,
} from '@/lib/state/fieldLedger';
import { ensureBlock } from '@/lib/blocks/useOlxJson';
import { leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import type { StateKey } from '@/lib/types/id-grammar';
import { getActorId } from '@/lib/crdt/actorId';
import { backoffMs } from '@/lib/util/async';
import type { RuntimeProps } from '@/lib/types';

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

// retry-wait keys with a wake-up timer already scheduled.
const scheduledRetries = new Map<StateKey, ReturnType<typeof setTimeout>>();

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

/** A retry-wait key re-ensures itself when its backoff elapses; the
 * ledger recomputes eligibility, so a spurious wake-up is harmless. */
function scheduleRetry(
  props: RuntimeProps,
  key: StateKey,
  opts: { policy?: FreshnessPolicy },
) {
  if (scheduledRetries.has(key)) return;
  const entry = props.runtime.store.getState()?.application_state?.fieldLedger?.[key];
  const attempt = entry?.attempt;
  if (!attempt) return;
  const eligibleAt = (attempt.lastFailureAt ?? attempt.startedAt)
    + backoffMs(STATE_RETRY, attempt.failures);
  const timer = setTimeout(() => {
    scheduledRetries.delete(key);
    ensureInstance(props, [key], { lanes: ['state'], ...opts });
  }, Math.max(0, eligibleAt - Date.now()));
  (timer as any).unref?.(); // never hold a test/node process open
  scheduledRetries.set(key, timer);
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

/** Test hook: drop batch + retry bookkeeping between cases. */
export function resetEnsureForTests() {
  pendingKeys = new Set();
  pendingStore = null;
  flushScheduled = false;
  for (const timer of scheduledRetries.values()) clearTimeout(timer);
  scheduledRetries.clear();
}
