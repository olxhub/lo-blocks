// packages/shared/lib/async/quota.ts
//
// Per-user quota: request-rate (RPM) and token budget, backed by a key-value
// store. The store-backed members of the async-call wrapper family.
//
// Unlike the in-process wrappers here (retry/throttle/...), these manage call
// admission ACROSS processes via a shared store, so they take the store as a
// parameter (the dict-like object) rather than importing one — keeping this a
// leaf module. Any `KvLike` works: apps/server's KVStore satisfies it
// structurally; tests pass a Map-backed stub.

import { kvsKey, type SafeUserId, type KVSKey } from '@/lib/types/identity';

/** The slice of a key-value store these helpers need (string get/set). */
export interface KvLike {
  get(key: KVSKey): Promise<string | null>;
  set(key: KVSKey, value: string): Promise<void>;
}

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
  store: KvLike,
  userId: SafeUserId,
  rpm: number,
): Promise<{ ok: boolean; retryAfter?: number }> {
  const key = kvsKey.rateRpm(userId);
  const now = Date.now();

  const raw = await store.get(key);
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
  await store.set(key, JSON.stringify(record));
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
  store: KvLike,
  userId: SafeUserId,
  tokenBudget: number,
): Promise<{ ok: boolean; remaining: number }> {
  const key = kvsKey.rateTokens(userId);

  const raw = await store.get(key);
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
  store: KvLike,
  userId: SafeUserId,
  tokens: number,
): Promise<void> {
  const key = kvsKey.rateTokens(userId);

  const raw = await store.get(key);
  const record: TokenRecord = raw ? JSON.parse(raw) : { total: 0 };

  record.total += tokens;
  await store.set(key, JSON.stringify(record));
}
