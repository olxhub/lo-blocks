// packages/shared/lib/async/quota.test.ts
//
// Per-user quota helpers against a Map-backed KvLike stub (no apps/server).

import { describe, it, expect } from 'vitest';
import { checkRateLimit, checkTokenBudget, recordTokenUsage, type KvLike } from './quota';
import { asSafeUserId, kvsKey } from '@/lib/types/identity';

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

  // The budget is charged per user PER ACTIVITY. A student who spends their
  // allowance on one handout must still be able to work on the next; a single
  // shared pool made every activity compete with every other, and the one that
  // ran out was whichever they happened to reach last.
  it('keeps each activity on its own budget', async () => {
    const store = makeStore();
    const budget = 1000;
    const h1 = 'edu.memphis.psych/bmod_handout1';
    const h2 = 'edu.memphis.psych/bmod_handout2';

    await recordTokenUsage(store, user, 1200, h1);

    expect((await checkTokenBudget(store, user, budget, h1)).ok).toBe(false);
    expect(await checkTokenBudget(store, user, budget, h2))
      .toEqual({ ok: true, remaining: 1000 });
  });

  it('keeps each USER separate within the same activity', async () => {
    const store = makeStore();
    const other = asSafeUserId('user-2');
    const h1 = 'edu.memphis.psych/bmod_handout1';

    await recordTokenUsage(store, user, 900, h1);
    expect((await checkTokenBudget(store, user, 1000, h1)).remaining).toBe(100);
    expect((await checkTokenBudget(store, other, 1000, h1)).remaining).toBe(1000);
  });

  // A call from outside any activity — docs, the playground — still counts,
  // against the original unscoped key, so nothing goes unmetered.
  it('falls back to a shared pool when no activity is given', async () => {
    const store = makeStore();
    await recordTokenUsage(store, user, 400);
    expect((await checkTokenBudget(store, user, 1000)).remaining).toBe(600);
    // ...and that pool is not any activity's pool.
    expect((await checkTokenBudget(store, user, 1000, 'act')).remaining).toBe(1000);
  });

  it('survives an activity id containing path separators', async () => {
    // Ids carry `/`, which FileKVStore maps to directories — the key encodes it.
    const store = makeStore();
    const weird = 'ns/with/slashes#attempt_0';
    await recordTokenUsage(store, user, 250, weird);
    expect((await checkTokenBudget(store, user, 1000, weird)).remaining).toBe(750);
  });

  // The scoped key must not turn the legacy per-user key into a directory.
  // Every user who has made a call already has `rate:{user}:tokens` as a FILE;
  // a `…:tokens:{activity}` key would need it to be a directory, the write
  // would fail with EEXIST, and usage would silently stop being recorded.
  it('does not nest the scoped key underneath the unscoped one', () => {
    const plain = kvsKey.rateTokens(user);
    const scoped = kvsKey.rateTokens(user, 'edu.memphis.psych/bmod_handout1');
    expect(scoped.startsWith(plain + ':')).toBe(false);
    expect(scoped).not.toContain('tokens:');
    // ...and the two remain distinct pools.
    expect(scoped).not.toBe(plain);
  });
});
