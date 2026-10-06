// packages/shared/lib/llm/runnerGuards.ts
//
// Readiness predicates for driving LLM-backed blocks in a harness.
//
// These are tiny, and they are a separate module because getting them wrong is
// expensive in a way that is hard to see: a predicate that mistakes a failure
// for a success quietly feeds error text into a measurement, and one that
// mistakes a success for a failure quietly discards good cells. Both have
// happened here. They are pure so they can be tested in both directions.

import { LLM_STATUS } from '@/lib/llm/reduxClient';

/** The two states an LLM action can finish in. */
export function isTerminal(status: unknown): boolean {
  return status === LLM_STATUS.RESPONSE_READY || status === LLM_STATUS.ERROR;
}

/** Finished, and finished well. An error is terminal but not ready. */
export function isReady(status: unknown): boolean {
  return status === LLM_STATUS.RESPONSE_READY;
}

/**
 * Has this cell settled?
 *
 * `status` is read now; `before` is what it held immediately before the action
 * was triggered. Both matter, for opposite reasons:
 *
 *   - Without `before`, a shared store makes the PREVIOUS cell's terminal
 *     status look like this one's, and the harness reads stale results.
 *   - Requiring that a transient RUNNING be observed instead would drop any
 *     cell that finishes between two polls — a false negative on a good cell.
 *
 * So: terminal, and not the same terminal state we started in. Callers reset
 * the status before triggering, which makes `before` non-terminal and this
 * unambiguous; the `before` check is the backstop for when they forget.
 */
export function hasSettled(status: unknown, before: unknown): boolean {
  if (!isTerminal(status)) return false;
  if (!isTerminal(before)) return true;
  return status !== before;
}

/**
 * Should this cell be tried again?
 *
 * Only a terminal failure is worth retrying. A success must never be retried
 * (it would spend a second call and could replace a good result with a worse
 * one), and a cell still running has not failed yet. `attempt` is 1-based.
 */
export function shouldRetry(status: unknown, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) return false;
  return status === LLM_STATUS.ERROR;
}

/**
 * How long to wait before the next attempt, in ms.
 *
 * Exponential with a ceiling. The failures this exists for arrive in bursts —
 * several near-identical prompts in quick succession — so the first backoff is
 * already seconds rather than milliseconds.
 */
export function backoffMs(attempt: number): number {
  return Math.min(5000 * 2 ** Math.max(0, attempt - 1), 40000);
}
