// packages/shared/lib/types/identity.ts
//
// Branded types for user identity and KVS key construction.
//
// UserId and SafeUserId prevent accidentally mixing raw usernames with
// provenance-prefixed storage keys. KVSKey prevents passing arbitrary
// strings as KVS keys — all keys must be constructed through typed
// builder functions that enforce the naming convention.

import { Branded } from './brand';

// ═══════════════════════════════════════════════════════════════════════════════
// USER IDENTITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Raw user identifier from the auth provider (e.g., "mchen", "curious-pigeon-72").
 * Not safe for direct use as a storage key — use SafeUserId for that.
 */
export type UserId = Branded<string, 'UserId'>;

/**
 * Provenance-prefixed, URL-safe storage key (e.g., "nginx-mchen", "guest-curious-pigeon-72").
 * Built by encodeId() in auth.ts. Safe for use in KVS keys and file paths.
 */
export type SafeUserId = Branded<string, 'SafeUserId'>;

// --- Validation --------------------------------------------------------------

// TODO: Decide on user ID format constraints. For now, accept anything non-empty.
// Candidates: alphanumeric + hyphens, email-like, UUID, etc. Depends on which
// auth providers we support (nginx basic auth, LTI, OAuth, guest cookies).
const VALID_USER_ID = /^.+$/;

// SafeUserId is always "provenance-quotePlus(rawId)", e.g. "nginx-mchen".
// TODO: Tighten once provenance list is finalized.
const VALID_SAFE_USER_ID = /^.+$/;

export function validateUserId(s: string): true | string {
  if (!s) return 'UserId cannot be empty';
  if (!VALID_USER_ID.test(s)) return `Not a valid UserId: "${s}"`;
  return true;
}

export function validateSafeUserId(s: string): true | string {
  if (!s) return 'SafeUserId cannot be empty';
  if (!VALID_SAFE_USER_ID.test(s)) return `Not a valid SafeUserId: "${s}"`;
  return true;
}

// --- Unchecked casts (asX) ---------------------------------------------------

export const asUserId = (s: string) => s as UserId;
export const asSafeUserId = (s: string) => s as SafeUserId;

// --- Parsers (parseX) --------------------------------------------------------

function assertValid(result: true | string): asserts result is true {
  if (result !== true) throw new Error(result);
}

export function parseUserId(s: string): UserId {
  assertValid(validateUserId(s));
  return asUserId(s);
}

export function parseSafeUserId(s: string): SafeUserId {
  assertValid(validateSafeUserId(s));
  return asSafeUserId(s);
}

// ═══════════════════════════════════════════════════════════════════════════════
// KVS KEY TYPES
// ═══════════════════════════════════════════════════════════════════════════════
//
// All KVS keys are constructed through typed builder functions. This prevents
// typos, ensures consistent naming, and makes it easy to find all key patterns
// by searching for KVSKey construction sites.

/**
 * A validated key for the KVS store. Cannot be constructed from raw strings —
 * use the kvsKey.* builder functions.
 */
export type KVSKey = Branded<string, 'KVSKey'>;

const asKVSKey = (s: string) => s as KVSKey;

/**
 * Builder functions for KVS keys. Each function enforces a specific key
 * pattern and takes typed arguments.
 *
 * Key namespace conventions:
 *   blob:{safeUserId}                — user state blob
 *   field:{safeUserId}:{scope}:{name} — individual state fields
 *   rate:{safeUserId}:rpm            — rate limit: requests per minute
 *   rate:{safeUserId}:tokens         — rate limit: token budget
 */
export const kvsKey = {
  /** User state blob: `blob:{safeUserId}` */
  blob(safeUserId: SafeUserId): KVSKey {
    return asKVSKey(`blob:${safeUserId}`);
  },

  /** Individual state field: `field:{levelInstance}:{scope}:{name}` —
   * levelInstance addresses one copy of the state (user:<id> /
   * set:<name>:<member> / all; lib/state/sync/levels.ts). The name is a
   * state-bucket key (usually an OLX block id) and can contain `/`, `#`,
   * `:`, spaces — anything. It is percent-encoded so the key stays a
   * flat token: FileKVStore maps `:` to directories, and a raw id like
   * `repo/course/#attempt_0` would explode into nested paths that
   * collide with sibling keys (ENOTDIR, found 2026-07-07). */
  field(levelInstance: string, scope: string, name: string): KVSKey {
    return asKVSKey(`field:${levelInstance}:${scope}:${encodeURIComponent(name)}`);
  },

  /** Index of an instance's field buckets (the KVS has no key
   * enumeration): `fieldindex:{levelInstance}` — JSON of scope →
   * bucket-name list. */
  fieldIndex(levelInstance: string): KVSKey {
    return asKVSKey(`fieldindex:${levelInstance}`);
  },

  /** Rate limit RPM counter: `rate:{safeUserId}:rpm` */
  rateRpm(safeUserId: SafeUserId): KVSKey {
    return asKVSKey(`rate:${safeUserId}:rpm`);
  },

  /** Rate limit token budget: `rate:{safeUserId}:tokens` */
  rateTokens(safeUserId: SafeUserId): KVSKey {
    return asKVSKey(`rate:${safeUserId}:tokens`);
  },
} as const;
