// packages/shared/lib/async/throttle.ts
//
// throttle — run the wrapped call at most once per interval (per key).
//
// Within the interval, every caller gets back the LAST attempt's promise —
// resolved OR rejected. Caching the rejection is the point: it backs off a
// persistently failing source instead of re-hitting it on every call, while a
// success is served from cache until the interval lapses. Concurrent callers
// within one interval also share the in-flight promise (single-flight for free).
//
// This is the git provider's head-check cooldown: check the remote at most
// once per cooldown window, and don't re-contact a down remote every request.
//
// NOT a single-flight: coalescing only lasts the interval. If a call outlives
// its interval, a later call starts a fresh run — so if the wrapped work
// mutates shared state, compose with singleFlight (throttle(singleFlight(fn)))
// to guarantee one run at a time regardless of interval.
//
// In-process only. The distributed, per-user variant (RPM limiting) takes a
// dict-like store and lands with quota in the rate-limit work.

import type { AsyncFn } from './types';

/**
 * @param intervalMs - minimum time between executions per key. 0 disables
 *   throttling (always runs), which is convenient for tests.
 * @param keyOf - derive the throttle key from args (default: one global key).
 */
export function throttle<A extends unknown[], R>(
  fn: AsyncFn<A, R>,
  intervalMs: number,
  keyOf: (...args: A) => string = () => '',
): AsyncFn<A, R> {
  const last = new Map<string, { at: number; result: Promise<R> }>();
  return (...args: A): Promise<R> => {
    const key = keyOf(...args);
    const now = Date.now();
    const prev = last.get(key);
    if (prev && now - prev.at < intervalMs) return prev.result;
    const result = fn(...args);
    last.set(key, { at: now, result });
    return result;
  };
}
