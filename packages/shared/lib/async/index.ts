// packages/shared/lib/async/index.ts
//
// Async-call wrappers: a family of higher-order functions that each layer one
// cross-cutting behavior onto an async function, with a consistent
// (fn, opts) => fn' shape so they compose by nesting. See ./types.ts.
//
//   withRetry     retry transient failures with backoff + jitter
//   singleFlight  coalesce concurrent same-key calls onto one promise
//   timeout       reject if the call runs too long
//   memoize       cache resolved results by key (TTL/LRU); never caches errors
//   throttle      run at most once per interval per key (caches errors too)
//
// Store-backed members (take a dict-like KvLike rather than running in-process,
// because they coordinate across processes):
//   quota         per-user request-rate (RPM) + token budget
//
// Still ad hoc, not yet here: the distributed store-backed throttle (RPM is
// currently its own helper in quota) and the atomic-counter fix.

export type { AsyncFn } from './types';
export { sleep } from './types';
export { withRetry, backoffMs, type RetryPolicy } from './retry';
export { singleFlight } from './singleFlight';
export { timeout, TimeoutError } from './timeout';
export { memoize, type MemoizeOptions } from './memoize';
export { throttle } from './throttle';
export { checkRateLimit, checkTokenBudget, recordTokenUsage, type KvLike } from './quota';
