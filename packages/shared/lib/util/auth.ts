// packages/shared/lib/util/auth.ts
//
// Shared auth identity resolution for server-side code.
//
// Both the app server (apps/server) and the standalone event-server
// (packages/shared/scripts/event-server.ts) need to resolve HTTP Basic
// credentials into a user identity. This module is the single source of
// truth for that logic.
//
// We mirror Learning Observer's shape so the two servers are interchangeable:
//
//   user_id        bare username from Basic auth (matches LO's event-stream
//                  basic_auth in auth/events.py, which returns the bare
//                  username rather than the "httpauth-" prefixed id used by
//                  LO's login-page path)
//   provenance     'nginx' for HTTP Basic, 'guest' for the no-auth fallback
//   safe_user_id   provenance-prefixed, URL-encoded key used for server-side
//                  persistence; computed with encodeId below, a JS port of
//                  LO's auth.events.encode_id (urllib.parse.quote_plus with
//                  safe='@') so blobs land at byte-identical keys on both
//                  servers.
//
// When we add richer auth (LTI, OAuth), this module grows; the WS payload
// shape stays the same thanks to the client's spread-based forward-compat.
//
// The current code is scaffolding -- we'd like to be down to one server --
// but we will need a shared auth layer eventually, so we might as well
// start getting blocks in the right place now.

import type { CurrentUser } from '@/lib/types';
import { generateGuestName } from '@/lib/util/guestNames';
import { quotePlus } from '@/lib/util/quotePlus';

export interface AuthUser extends CurrentUser {
  authorized: boolean;
  safe_user_id: string;
}

/**
 * Build a provenance-prefixed, URL-safe storage key from auth source and
 * raw user ID. Mirrors Learning Observer's auth.events.encode_id so blobs
 * keyed by either server land at byte-identical paths.
 */
export function encodeId(source: string, unsafeId: string): string {
  return `${source}-${quotePlus(unsafeId)}`;
}

/**
 * Parse an Authorization header for HTTP Basic and return the username, or
 * null if the header is absent or not a Basic credential. We do NOT verify
 * the password — in prod nginx handles verification; in dev we trust local
 * traffic.
 */
export function parseBasicAuth(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 0) return null;
    return decoded.slice(0, colonIdx);
  } catch {
    return null;
  }
}

/**
 * Resolve the user identity for an incoming connection from HTTP Basic auth.
 * Returns null if no Basic credentials are present.
 */
export function resolveBasicAuth(req: { headers: { authorization?: string } }): AuthUser | null {
  const username = parseBasicAuth(req.headers.authorization);
  if (username === null) return null;
  return {
    user_id: username,
    provenance: 'nginx',
    safe_user_id: encodeId('nginx', username),
    authorized: true,
  };
}

/** Mint a new guest identity. Ephemeral unless persisted via session cookie. */
export function createGuestUser(): AuthUser {
  const guestName = generateGuestName();
  return {
    user_id: guestName,
    provenance: 'guest',
    safe_user_id: encodeId('guest', guestName),
    authorized: false,
  };
}

/**
 * Resolve the user identity for an incoming connection.
 *
 * Priority: HTTP Basic > guest fallback.
 * Session cookie handling is done by the server layer (apps/server/src/session.ts)
 * which wraps this function.
 */
export function resolveUser(req: { headers: { authorization?: string } }): AuthUser {
  return resolveBasicAuth(req) ?? createGuestUser();
}
