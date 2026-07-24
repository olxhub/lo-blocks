// packages/shared/lib/async/timeout.ts
//
// timeout — reject if the wrapped call doesn't settle within `ms`.
//
// NOTE: JavaScript can't cancel a pending promise, so the underlying work
// keeps running after the timeout fires; we just stop waiting on it. This
// matches the existing race-a-timer pattern in the translation routes.

import type { AsyncFn } from './types';

export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** Wrap `fn` so it rejects with TimeoutError if it runs longer than `ms`. */
export function timeout<A extends unknown[], R>(fn: AsyncFn<A, R>, ms: number): AsyncFn<A, R> {
  return (...args: A): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
      fn(...args).then(resolve, reject).finally(() => clearTimeout(timer));
    });
}
