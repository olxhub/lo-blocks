// packages/shared/lib/state/fieldLedger.ts
//
// The field-state LEDGER — per-StateKey provenance for the state lane of
// the ensure pipeline (the content lane's ledger is olxjson's
// loadingState; this is its sibling for field state).
//
// The ledger stores timestamped FACTS, never statuses: when a key's
// state was last resolved (adopted from a server response, or the
// server confirmed there is none) and what this page load's fetch
// attempts have done. Readiness is DERIVED at read time by a
// FreshnessPolicy over those facts — so a stale entry can't lie the way
// a persisted 'loading' status would, and different contexts can read
// the same facts under different policies:
//
//   ephemeral      no server state wanted — always ready (scratch pages)
//   currentLoad    resolved during THIS page load — today's default
//   anyValid       resolved ever
//   offlineWindow  resolved recently enough — the offline-mode policy.
//                  BREADCRUMB: needs resolvedAt/loadGuid to persist and
//                  reload (they are designed to — plain JSON facts, no
//                  page-load-scoped meaning), which is not wired yet.
//
// Failures are facts too: `attempt` records when this page load tried
// and how many times it failed. Retry eligibility is recomputed from
// backoffMs (util/async — the same formula withRetry sleeps on) rather
// than scheduled — "Tried at 5:14:31, one failure so far; eligible
// again 500ms later."
//
// Ledger events are dispatched directly on the store (like
// ADOPT_FIELD_STATE), never through logEvent: fetch bookkeeping is not
// learner activity — it must not reach the event log, the wire, or the
// server materialization. Dispatch helpers stamp `at` so the reducer
// stays pure (replay-safe).
//
// Redux placement: application_state.fieldLedger[stateKey]. Deliberately
// NOT inside the component bucket — bucket keys are field names and ride
// CRDT merge paths where per-device fetch facts don't belong. Callers
// never see the placement: they go through the selector/get/use triplet,
// so moving the ledger later is a non-event.

import { useSelector } from 'react-redux';
import type { StateKey } from '@/lib/types/id-grammar';
import { getActorId } from '@/lib/crdt/actorId';
import { backoffMs, type RetryPolicy } from '@/lib/util/async';

// =============================================================================
// Facts
// =============================================================================

/** One page load's fetch bookkeeping for a key. Meaningful only under
 * its own loadGuid — an attempt from a previous load is self-evidently
 * dead and reads as 'unknown', not as in-flight. */
export interface LedgerAttempt {
  loadGuid: string;
  /** When the current in-flight request started. */
  startedAt: number;
  /** Failures so far this page load. */
  failures: number;
  /** When the LAST failure landed — retry eligibility counts from here. */
  lastFailureAt?: number;
  lastError?: string;
  /** The server answered "no" (404 / API error). A fatal fact makes the
   * attempt terminal regardless of failure count — retrying is pointless. */
  fatal?: boolean;
  /** The REQUEST PROFILE this attempt was made under (see LedgerEntry). */
  profile?: string;
}

/** Everything the ledger knows about one StateKey. Facts, not statuses. */
export interface LedgerEntry {
  /** When this key's state was last resolved: adopted from a server
   * response, or the server confirmed there is none. Persistable — the
   * offline-window policy reads it across reloads. */
  resolvedAt?: number;
  /** Which page load resolved it (getActorId()). */
  loadGuid?: string;
  /** The REQUEST PROFILE the resolution was made under — what we sent to
   * the server (for content: the locale). Currently the only profile
   * dimension is locale, but this will grow (bandwidth, a11y, explicit
   * overrides) — all fed into one negotiation, CSS-cascade style. A
   * resolution under a different profile is not fresh for this one. */
  profile?: string;
  attempt?: LedgerAttempt;
}

export type FieldLedgerState = Record<string, LedgerEntry>;

export const initialFieldLedgerState: FieldLedgerState = {};

// =============================================================================
// Freshness policies — readiness derived from facts
// =============================================================================

/** Does the resolved fact satisfy this context's freshness needs? */
export type FreshnessPolicy = (
  entry: LedgerEntry | undefined,
  now: number,
  loadGuid: string,
) => boolean;

export const policies = {
  /** Scratch/ephemeral pages: no server state wanted, always ready. */
  ephemeral: (() => true) as FreshnessPolicy,

  /** Resolved during THIS page load. Today's default. */
  currentLoad: ((entry, _now, loadGuid) =>
    entry?.resolvedAt !== undefined && entry.loadGuid === loadGuid) as FreshnessPolicy,

  /** Resolved ever — trust whatever the store holds. */
  anyValid: ((entry) => entry?.resolvedAt !== undefined) as FreshnessPolicy,

  /** Resolved within the window — the offline-operation policy ("state
   * from within the past week → keep going, indicate offline").
   * BREADCRUMB: meaningful across reloads only once the ledger's
   * resolved facts persist with the field state. */
  offlineWindow: (ms: number): FreshnessPolicy =>
    (entry, now) => entry?.resolvedAt !== undefined && now - entry.resolvedAt <= ms,
} as const;

/** State-lane retry: first retry 500ms after a failure, backing off to
 * 10s, giving up after 5 tries this page load. */
export const STATE_RETRY: RetryPolicy = { attempts: 5, baseMs: 500, maxMs: 10_000 };

/** What a caller should DO about a key, derived from the facts. */
export type Freshness =
  | 'ready'        // policy satisfied — render
  | 'pending'      // a fetch is in flight this page load — wait
  | 'retry-wait'   // failed recently — eligible again after backoff
  | 'failed'       // out of attempts this page load — error placeholder
  | 'unknown';     // never tried this page load — ensure it

export function freshness(
  entry: LedgerEntry | undefined,
  {
    policy = policies.currentLoad,
    retry = STATE_RETRY,
    now = Date.now(),
    loadGuid = getActorId(),
    profile,
  }: { policy?: FreshnessPolicy; retry?: RetryPolicy; now?: number; loadGuid?: string; profile?: string } = {},
): Freshness {
  // When a profile is supplied, a resolution made under a DIFFERENT
  // profile (e.g. a new locale) is not fresh — the old content is still
  // in store, but this profile deserves its own fetch. A resolution with
  // NO recorded profile is profile-agnostic (inline/static/sync content)
  // and matches any request. When opts.profile is undefined, profile is
  // ignored entirely and behavior is exactly as before.
  const profileMismatch = (p?: string) =>
    profile !== undefined && p !== undefined && p !== profile;
  if (!profileMismatch(entry?.profile) && policy(entry, now, loadGuid)) return 'ready';
  const attempt = entry?.attempt;
  // Attempts from a previous page load are dead facts, not in-flight.
  if (!attempt || attempt.loadGuid !== loadGuid) return 'unknown';
  // A live attempt under a different profile reads as never-tried: the
  // new profile deserves a fresh fetch, not a wait on the old one.
  if (profileMismatch(attempt.profile)) return 'unknown';
  // The server answered "no" — terminal, whatever the failure count.
  if (attempt.fatal) return 'failed';
  if (attempt.failures === 0) return 'pending';
  if (attempt.failures >= retry.attempts) return 'failed';
  const eligibleAt = (attempt.lastFailureAt ?? attempt.startedAt) + backoffMs(retry, attempt.failures);
  if (now < eligibleAt) return 'retry-wait';
  // Eligible again: a failed attempt whose backoff has elapsed reads as
  // never-tried, so the ensure machinery fires again (failures carry
  // forward in the reducer — this does not reset the count).
  return 'unknown';
}

// =============================================================================
// Events + reducer
// =============================================================================
// Dispatched directly on the store (see module header). Payloads carry
// `at` and `loadGuid` so the reducer is pure and replayable.

export const FIELDSTATE_LOADING = 'FIELDSTATE_LOADING';
export const FIELDSTATE_RESOLVED = 'FIELDSTATE_RESOLVED';
export const FIELDSTATE_ERROR = 'FIELDSTATE_ERROR';

export const FIELD_LEDGER_EVENT_TYPES = [
  FIELDSTATE_LOADING, FIELDSTATE_RESOLVED, FIELDSTATE_ERROR,
];

export function fieldLedgerReducer(
  state: FieldLedgerState = initialFieldLedgerState,
  action: any,
): FieldLedgerState {
  const { keys, at, loadGuid } = action;
  if (!Array.isArray(keys) || keys.length === 0 || typeof at !== 'number') return state;

  switch (action.type) {
    case FIELDSTATE_LOADING: {
      const next = { ...state };
      for (const key of keys) {
        const prev = next[key];
        const prevAttempt = prev?.attempt;
        // Failure count carries across attempts within one page load;
        // a new load starts clean (the old attempt's guid is dead).
        const failures = prevAttempt && prevAttempt.loadGuid === loadGuid
          ? prevAttempt.failures : 0;
        next[key] = { ...prev, attempt: { loadGuid, startedAt: at, failures } };
      }
      return next;
    }

    case FIELDSTATE_RESOLVED: {
      const next = { ...state };
      for (const key of keys) {
        next[key] = { resolvedAt: at, loadGuid };
      }
      return next;
    }

    case FIELDSTATE_ERROR: {
      const next = { ...state };
      const message = action.error ?? 'fetch failed';
      for (const key of keys) {
        const prev = next[key];
        const prevAttempt = prev?.attempt;
        const attempt: LedgerAttempt = prevAttempt && prevAttempt.loadGuid === loadGuid
          ? prevAttempt
          : { loadGuid, startedAt: at, failures: 0 };
        next[key] = {
          ...prev,
          attempt: {
            ...attempt,
            failures: attempt.failures + 1,
            lastFailureAt: at,
            lastError: message,
          },
        };
      }
      return next;
    }

    default:
      return state;
  }
}

// =============================================================================
// Selector / get / use triplet
// =============================================================================
// The ONLY way to read the ledger — placement (currently
// application_state.fieldLedger) is this module's private business.

export function selectFieldFreshness(
  state: any,
  stateKey: StateKey,
  opts?: { policy?: FreshnessPolicy; retry?: RetryPolicy; now?: number },
): Freshness {
  const entry: LedgerEntry | undefined = state?.application_state?.fieldLedger?.[stateKey];
  return freshness(entry, opts);
}

/** The current page load's fetch attempt for a key, if any — what an
 * error placeholder renders ("Tried loading at …, N failures so far"). */
export function selectFieldAttempt(state: any, stateKey: StateKey): LedgerAttempt | undefined {
  const entry: LedgerEntry | undefined = state?.application_state?.fieldLedger?.[stateKey];
  const attempt = entry?.attempt;
  return attempt && attempt.loadGuid === getActorId() ? attempt : undefined;
}

export function getFieldFreshness(
  props: { runtime: { store: { getState(): any } } },
  stateKey: StateKey,
  opts?: { policy?: FreshnessPolicy; retry?: RetryPolicy },
): Freshness {
  return selectFieldFreshness(props.runtime.store.getState(), stateKey, opts);
}

export function useFieldFreshness(
  stateKey: StateKey,
  opts?: { policy?: FreshnessPolicy; retry?: RetryPolicy },
): Freshness {
  return useSelector((state: any) => selectFieldFreshness(state, stateKey, opts));
}
