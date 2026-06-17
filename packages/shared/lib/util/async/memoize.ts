// packages/shared/lib/util/async/memoize.ts
//
// memoize — cache an async function's RESOLVED result by key.
//
// Caches the promise (so concurrent callers also share one in-flight call),
// but evicts on rejection so a failure is never cached — the next call retries.
// Optional TTL and LRU cap. Use for expensive idempotent work keyed by
// identity, e.g. one in-memory git clone per repo.
//
// Contrast with throttle (which DOES cache failures, to back off a dead
// source) and singleFlight (which caches nothing past settlement).

import type { AsyncFn } from './types';

export interface MemoizeOptions<A extends unknown[]> {
  /** Cache key from args (default: one global key). */
  keyOf?: (...args: A) => string;
  /** Entry lifetime in ms (default: forever). */
  ttlMs?: number;
  /** Max entries; evicts least-recently-used beyond this (default: unbounded). */
  max?: number;
}

export function memoize<A extends unknown[], R>(
  fn: AsyncFn<A, R>,
  options: MemoizeOptions<A> = {},
): AsyncFn<A, R> {
  const { keyOf = () => '', ttlMs, max } = options;
  const cache = new Map<string, { value: Promise<R>; expires: number }>();

  return (...args: A): Promise<R> => {
    const key = keyOf(...args);
    const now = Date.now();

    const hit = cache.get(key);
    if (hit && hit.expires > now) {
      cache.delete(key); // re-insert to refresh LRU recency
      cache.set(key, hit);
      return hit.value;
    }

    const value = fn(...args);
    // Never cache a rejection: drop the entry so the next call retries.
    value.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key);
    });
    // Delete-then-set so a recomputed (e.g. expired) key moves to most-recent
    // for LRU — a plain set() on an existing key keeps its insertion position.
    cache.delete(key);
    cache.set(key, { value, expires: ttlMs === undefined ? Infinity : now + ttlMs });

    if (max !== undefined && cache.size > max) {
      const oldest = cache.keys().next().value; // Map iterates in insertion order
      if (oldest !== undefined) cache.delete(oldest);
    }
    return value;
  };
}
