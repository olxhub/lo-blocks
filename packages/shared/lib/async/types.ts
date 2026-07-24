// packages/shared/lib/async/types.ts
//
// Shared shape for the async-call wrappers in this directory.
//
// Each wrapper is a higher-order function (fn, opts) => fn' that takes an
// async function and returns one with the SAME signature, layering one
// cross-cutting behavior (retry, single-flight, timeout, memoize, throttle).
// They compose by nesting — throttle(withRetry(fn, ...), ...) — the TypeScript
// analog of stacking Python decorators (@throttle @withRetry def f...).
//
// Dependency-free and isomorphic (browser + node). Behaviors that need a
// backing store (per-user quota, distributed throttle) take a dict-like store
// as a parameter rather than importing one, so this stays a leaf module.

/** An async function of any argument shape — what every wrapper transforms. */
export type AsyncFn<A extends unknown[] = unknown[], R = unknown> = (...args: A) => Promise<R>;

/** Resolve after `ms` (used by the delay-based wrappers). */
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
