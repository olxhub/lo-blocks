// rateLimit.ts
//
// Per-user rate limiting for the LLM endpoint.
//
// Two dimensions:
//   1. Requests per minute (RPM) — sliding window counter in KVS
//   2. Token budget — running total of LLM tokens in KVS, incremented after
//      each response. Separate from any future dollar/Euro cost budgets.
//
// Both limits come from PMSS (resolved per profile), so different use cases
// can have different limits.

import type { KVStore } from './kvs.js';
import type { SafeUserId } from '@/lib/types/identity';
import { kvsKey } from '@/lib/types/identity';

const WINDOW_MS = 60_000; // 1 minute

// --- RPM (requests per minute) -----------------------------------------------

type RPMRecord = {
  count: number;
  windowStart: number;
};

/**
 * Check whether a user has exceeded their RPM limit.
 *
 * Uses a sliding window: if the stored window has expired, it resets.
 * If still within the window, increments the counter. Returns ok=false
 * with a retryAfter hint if the limit is exceeded.
 *
 * TODO(atomicity): The read-modify-write on the RPM counter is not atomic.
 * Two concurrent requests can both read count=19 (under a limit of 20),
 * both increment to 20, and both proceed. With MemoryKVStore this is
 * single-threaded so fine. With ValkeyKVStore (Redis), concurrent requests
 * from the same user can exceed the limit. For an educational platform this
 * is acceptable; a future fix would use Redis INCR with TTL instead of
 * get/parse/set. The same applies to recordTokenUsage below.
 */
export async function checkRateLimit(
  kvs: KVStore,
  userId: SafeUserId,
  rpm: number,
): Promise<{ ok: boolean; retryAfter?: number }> {
  const key = kvsKey.rateRpm(userId);
  const now = Date.now();

  const raw = await kvs.get(key);
  let record: RPMRecord = raw ? JSON.parse(raw) : { count: 0, windowStart: now };

  // Window expired — reset
  if (now - record.windowStart >= WINDOW_MS) {
    record = { count: 0, windowStart: now };
  }

  if (record.count >= rpm) {
    const retryAfter = Math.ceil((record.windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }

  record.count++;
  await kvs.set(key, JSON.stringify(record));
  return { ok: true };
}

// --- Token budget ------------------------------------------------------------

type TokenRecord = {
  total: number;
};

/**
 * Check whether a user's token budget is already exhausted.
 *
 * Called BEFORE the LLM call to gate whether the request should proceed.
 * Read-only — does not modify the running total.
 */
export async function checkTokenBudget(
  kvs: KVStore,
  userId: SafeUserId,
  tokenBudget: number,
): Promise<{ ok: boolean; remaining: number }> {
  const key = kvsKey.rateTokens(userId);

  const raw = await kvs.get(key);
  const record: TokenRecord = raw ? JSON.parse(raw) : { total: 0 };

  const remaining = Math.max(tokenBudget - record.total, 0);
  return { ok: record.total < tokenBudget, remaining };
}

/**
 * Record LLM token usage after a successful response.
 *
 * Increments the running total. Does NOT reject — the response has already
 * been generated and should always be returned. The next request will be
 * blocked by checkTokenBudget if the budget is now exhausted.
 */
export async function recordTokenUsage(
  kvs: KVStore,
  userId: SafeUserId,
  tokens: number,
): Promise<void> {
  const key = kvsKey.rateTokens(userId);

  const raw = await kvs.get(key);
  const record: TokenRecord = raw ? JSON.parse(raw) : { total: 0 };

  record.total += tokens;
  await kvs.set(key, JSON.stringify(record));
}
