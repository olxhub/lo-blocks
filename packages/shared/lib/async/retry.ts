// packages/shared/lib/async/retry.ts
//
// withRetry — retry a transient failure with exponential backoff + jitter.
//
// For OUTBOUND calls to flaky external services (LLM providers, git remotes):
// retry only errors the caller classifies as transient, wait a backing-off,
// jittered delay between attempts, and give up after a bounded number. Honors
// a server-supplied Retry-After hint when the error carries one.

import type { AsyncFn } from './types';
import { sleep } from './types';

export interface RetryPolicy {
  /** Total attempts INCLUDING the first (so 1 = no retry). */
  attempts: number;
  /** Delay before the first retry, in ms. */
  baseMs: number;
  /** Upper bound on any single backoff delay, in ms. */
  maxMs: number;
  /** Exponential growth per attempt (default 2). */
  factor?: number;
  /** Full jitter: use a random delay in [0, backoff] (default true). */
  jitter?: boolean;
  /** Which errors are worth retrying (default: all). */
  retryable?: (err: unknown) => boolean;
  /** Server-supplied wait hint (e.g. Retry-After); overrides the computed
   *  backoff for that attempt when it returns a number of ms. */
  retryAfterMs?: (err: unknown) => number | undefined;
  /** Observe each retry (logging/metrics); must not throw. */
  onRetry?: (info: { attempt: number; delayMs: number; err: unknown }) => void;
}

/**
 * The backoff ceiling before retry number `attempt` (1-based: the delay
 * after the first failure is backoffMs(policy, 1) = baseMs).
 *
 * THE one backoff formula. withRetry consumes it imperatively (sleep
 * between attempts); declarative retriers (the field ledger — a failure
 * is a timestamped fact, and eligibility is recomputed at read time)
 * consume it to answer "when is this key eligible to try again?".
 */
export function backoffMs(policy: Pick<RetryPolicy, 'baseMs' | 'maxMs' | 'factor'>, attempt: number): number {
  const factor = policy.factor ?? 2;
  return Math.min(policy.maxMs, policy.baseMs * factor ** (attempt - 1));
}

/** Wrap `fn` so transient failures are retried per `policy`. */
export function withRetry<A extends unknown[], R>(
  fn: AsyncFn<A, R>,
  policy: RetryPolicy,
): AsyncFn<A, R> {
  const {
    attempts, jitter = true,
    retryable = () => true, retryAfterMs, onRetry,
  } = policy;

  return async (...args: A): Promise<R> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        if (attempt >= attempts || !retryable(err)) throw err;
        const backoff = backoffMs(policy, attempt);
        const delayMs = retryAfterMs?.(err) ?? (jitter ? Math.random() * backoff : backoff);
        onRetry?.({ attempt, delayMs, err });
        await sleep(delayMs);
      }
    }
  };
}
