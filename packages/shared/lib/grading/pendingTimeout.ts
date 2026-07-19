// packages/shared/lib/grading/pendingTimeout.ts
//
// The async-pending TIMEOUT, as a DISPATCH.
//
// selectGradingState derives a STRANDED async submission — a stored
// correct='submitted' whose pendingGrade record is older than
// PENDING_GRADE_TIMEOUT_MS — as failed-retryable, AT READ TIME (it re-samples
// Date.now() on every read). That derivation is correct but INERT on its own:
// a React reader (useGradingState, useInputReadOnly) only re-runs its selector
// on a store notification, and nothing dispatches at the deadline. So without
// this module the inputs stay locked and the learner never sees "try again"
// until some unrelated event happens to nudge the store.
//
// This module arms a timer that, at the deadline, dispatches a real
// (analytics-logged) event — PENDING_GRADE_TIMEOUT. The event carries NO field
// value: it is a benign field-less touch of the grader's own component bucket.
// In updateResponseReducer's plain-spread path every envelope key (event,
// scope, id, metadata, …) is destructured out, so `rest` is empty and the
// bucket folds to `{ ...existing }` — a NEW state object with identical
// contents. That new object is exactly what the read model needs: it busts
// selectGradingState's per-state memo and notifies every subscriber, so the
// now-past-deadline derivation is finally read and the UI unlocks. (The event
// type must be registered in collectEventTypes/store.ts, or updateResponseReducer
// never runs for it — see PENDING_GRADE_TIMEOUT_EVENT's use there.)
//
// Deduped per stateKey by ABSOLUTE deadline: many readers classify the same
// pending record every render, but they all compute the same deadline
// (submittedAt + PENDING_GRADE_TIMEOUT_MS), so a timer already armed for that
// deadline is left alone. A resubmit stamps a new submittedAt → a later
// deadline → the old timer is superseded. The entry clears when the timer
// fires, when it is superseded, or when the result lands (clearPendingTimeout).
//
import { scopes } from '../state/scopes';
import type { RuntimeProps, StateKey } from '../types';

/** The field-less liveness event. Registered in store.ts so the reducer's
 *  plain-spread path runs and produces a new state object; see the file header. */
export const PENDING_GRADE_TIMEOUT_EVENT = 'PENDING_GRADE_TIMEOUT';

/** One timer per grader instance, tagged with the deadline it targets so a
 *  same-deadline re-schedule is a no-op (dedup) and a new-deadline one
 *  supersedes. Module-level: the timer is a browser-session liveness aid, not
 *  per-store state (guarded to the browser, where there is one UI). */
const timers = new Map<StateKey, { handle: ReturnType<typeof setTimeout>; deadline: number }>();

/**
 * Ensure a timer exists that will fire the liveness event for `stateKey` at
 * the absolute `deadline` (epoch ms). Idempotent per deadline.
 *
 * BROWSER ONLY: grading also runs headless (analytics, replay, server, node
 * tests), where there is no UI to unlock and a stray setTimeout would leak or
 * hold the process open. The guard lives here so the pure selector can call
 * this from its derivation without itself branching on the environment.
 */
export function schedulePendingTimeout(props: RuntimeProps, stateKey: StateKey, deadline: number): void {
  if (typeof window === 'undefined') return;
  const existing = timers.get(stateKey);
  if (existing) {
    if (existing.deadline === deadline) return;  // already armed for this deadline
    clearTimeout(existing.handle);               // resubmit moved the deadline — supersede
  }
  const handle = setTimeout(() => {
    timers.delete(stateKey);
    // A field-less event: scope + id route it to this grader's bucket, nothing
    // else rides it (see the header — the reducer folds an empty patch).
    props.runtime.logEvent(PENDING_GRADE_TIMEOUT_EVENT, { scope: scopes.component, id: stateKey });
  }, Math.max(0, deadline - Date.now()));
  timers.set(stateKey, { handle, deadline });
}

/**
 * Cancel a pending timer once its result has landed (submitGrade clears the
 * pendingGrade record). Without this the timer would still fire at the
 * deadline as a harmless no-op state touch — but a needless (and confusing)
 * analytics event minutes after the grade resolved.
 */
export function clearPendingTimeout(stateKey: StateKey): void {
  const existing = timers.get(stateKey);
  if (existing) {
    clearTimeout(existing.handle);
    timers.delete(stateKey);
  }
}
