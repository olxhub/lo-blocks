// packages/shared/lib/util/async/async.test.ts
//
// Behavior of the async-call wrapper family. Delays use tiny real intervals to
// keep the suite fast and free of fake-timer/promise-flush fragility.

import { describe, it, expect, vi } from 'vitest';
import { withRetry, singleFlight, timeout, TimeoutError, memoize, throttle, sleep } from './index';

describe('withRetry', () => {
  it('retries transient failures then succeeds, with backoff between attempts', async () => {
    let calls = 0;
    const onRetry = vi.fn();
    const fn = withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    }, { attempts: 5, baseMs: 1, maxMs: 4, jitter: false, onRetry });
    expect(await fn()).toBe('ok');
    expect(calls).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up after `attempts` and throws the last error', async () => {
    let calls = 0;
    const fn = withRetry(async () => { calls++; throw new Error(`boom ${calls}`); },
      { attempts: 3, baseMs: 1, maxMs: 1 });
    await expect(fn()).rejects.toThrow('boom 3');
    expect(calls).toBe(3);
  });

  it('does not retry errors the predicate rejects', async () => {
    let calls = 0;
    const fn = withRetry(async () => { calls++; throw new Error('fatal'); },
      { attempts: 5, baseMs: 1, maxMs: 1, retryable: e => (e as Error).message === 'transient' });
    await expect(fn()).rejects.toThrow('fatal');
    expect(calls).toBe(1);
  });

  it('honors a Retry-After hint over computed backoff', async () => {
    let calls = 0;
    const fn = withRetry(async () => { calls++; if (calls < 2) throw new Error('429'); return 1; },
      { attempts: 3, baseMs: 10_000, maxMs: 10_000, retryAfterMs: () => 1 });
    const start = Date.now();
    await fn();
    expect(Date.now() - start).toBeLessThan(500); // used the 1ms hint, not 10s backoff
  });
});

describe('singleFlight', () => {
  it('shares one in-flight promise for concurrent same-key calls', async () => {
    let calls = 0;
    const fn = singleFlight(async (id: string) => { calls++; await sleep(5); return `${id}:${calls}`; },
      (id) => id);
    const [a, b] = await Promise.all([fn('x'), fn('x')]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    // Different key runs independently.
    await fn('y');
    expect(calls).toBe(2);
  });

  it('re-runs after the prior call settles (no result caching)', async () => {
    let calls = 0;
    const fn = singleFlight(async () => { calls++; return calls; });
    expect(await fn()).toBe(1);
    expect(await fn()).toBe(2);
  });
});

describe('timeout', () => {
  it('rejects with TimeoutError when the call is too slow', async () => {
    const fn = timeout(async () => { await sleep(50); return 'late'; }, 10);
    await expect(fn()).rejects.toBeInstanceOf(TimeoutError);
  });

  it('resolves normally when the call is fast enough', async () => {
    const fn = timeout(async () => 'quick', 50);
    expect(await fn()).toBe('quick');
  });
});

describe('memoize', () => {
  it('caches resolved values and dedupes concurrent calls by key', async () => {
    let calls = 0;
    const fn = memoize(async (k: string) => { calls++; await sleep(2); return `${k}:${calls}`; },
      { keyOf: (k) => k });
    const [a, b] = await Promise.all([fn('p'), fn('p')]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(await fn('p')).toBe(a); // still cached after settle
  });

  it('never caches a rejection — the next call retries', async () => {
    let calls = 0;
    const fn = memoize(async () => { calls++; if (calls === 1) throw new Error('first fails'); return 'ok'; });
    await expect(fn()).rejects.toThrow('first fails');
    expect(await fn()).toBe('ok');
    expect(calls).toBe(2);
  });

  it('expires entries after ttlMs', async () => {
    let calls = 0;
    const fn = memoize(async () => { calls++; return calls; }, { ttlMs: 20 });
    expect(await fn()).toBe(1);
    expect(await fn()).toBe(1); // within ttl
    await sleep(30);
    expect(await fn()).toBe(2); // ttl lapsed
  });

  it('evicts least-recently-used beyond max', async () => {
    const seen: string[] = [];
    const fn = memoize(async (k: string) => { seen.push(k); return k; }, { keyOf: k => k, max: 2 });
    await fn('a'); await fn('b'); await fn('a'); // a is now most-recent
    await fn('c'); // size > 2 → evicts 'b' (LRU)
    await fn('a'); // still cached, no new call
    await fn('b'); // evicted → recomputed
    expect(seen).toEqual(['a', 'b', 'c', 'b']);
  });
});

describe('throttle', () => {
  it('runs at most once per interval, then again after it lapses', async () => {
    let calls = 0;
    const fn = throttle(async () => { calls++; return calls; }, 30);
    expect(await fn()).toBe(1);
    expect(await fn()).toBe(1); // within interval → cached
    await sleep(40);
    expect(await fn()).toBe(2); // interval lapsed
  });

  it('caches a rejection within the interval (backs off a failing source)', async () => {
    let calls = 0;
    const fn = throttle(async () => { calls++; throw new Error(`fail ${calls}`); }, 10_000);
    await expect(fn()).rejects.toThrow('fail 1');
    await expect(fn()).rejects.toThrow('fail 1'); // same cached rejection, not re-run
    expect(calls).toBe(1);
  });

  it('intervalMs 0 always runs', async () => {
    let calls = 0;
    const fn = throttle(async () => { calls++; return calls; }, 0);
    await fn(); await fn();
    expect(calls).toBe(2);
  });
});
