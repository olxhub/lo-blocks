// packages/shared/lib/util/async/singleFlight.ts
//
// singleFlight — coalesce concurrent calls with the same key onto one
// in-flight promise. The first caller runs `fn`; everyone who arrives while it
// is still pending shares that same promise. Once it settles the entry clears,
// so the next call runs fresh (no result caching — that's memoize).
//
// Replaces hand-rolled "is there already a request in flight for this id?"
// maps (translation dedupe, the git provider's refresh guard).

import type { AsyncFn } from './types';

/**
 * @param keyOf - derive the dedupe key from the args (default: one global key,
 *   i.e. at most one call in flight at a time regardless of arguments).
 */
export function singleFlight<A extends unknown[], R>(
  fn: AsyncFn<A, R>,
  keyOf: (...args: A) => string = () => '',
): AsyncFn<A, R> {
  const inflight = new Map<string, Promise<R>>();
  return (...args: A): Promise<R> => {
    const key = keyOf(...args);
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = fn(...args).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
