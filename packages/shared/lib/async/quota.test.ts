// packages/shared/lib/async/quota.test.ts
//
// Per-user quota helpers against a Map-backed KvLike stub (no apps/server).

import { describe, it, expect } from 'vitest';
import { checkRateLimit, checkTokenBudget, recordTokenUsage, type KvLike } from './quota';
import { asSafeUserId } from '@/lib/types/identity';

function makeStore(): KvLike {
  const m = new Map<string, string>();
  return {
    async get(key) { return m.get(key) ?? null; },
    async set(key, value) { m.set(key, value); },
  };
}

const user = asSafeUserId('user-1');

describe('checkRateLimit', () => {
  it('allows up to the limit, then rejects with a retryAfter hint', async () => {
    const store = makeStore();
    expect((await checkRateLimit(store, user, 2)).ok).toBe(true);
    expect((await checkRateLimit(store, user, 2)).ok).toBe(true);
    const third = await checkRateLimit(store, user, 2);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('keeps separate counters per user', async () => {
    const store = makeStore();
    await checkRateLimit(store, user, 1);
    expect((await checkRateLimit(store, user, 1)).ok).toBe(false);
    expect((await checkRateLimit(store, asSafeUserId('user-2'), 1)).ok).toBe(true);
  });
});

describe('token budget', () => {
  it('reports remaining and exhaustion as usage accumulates', async () => {
    const store = makeStore();
    const budget = 1000;

    let check = await checkTokenBudget(store, user, budget);
    expect(check).toEqual({ ok: true, remaining: 1000 });

    await recordTokenUsage(store, user, 600);
    check = await checkTokenBudget(store, user, budget);
    expect(check).toEqual({ ok: true, remaining: 400 });

    await recordTokenUsage(store, user, 600); // now 1200 > 1000
    check = await checkTokenBudget(store, user, budget);
    expect(check.ok).toBe(false);
    expect(check.remaining).toBe(0);
  });
});
