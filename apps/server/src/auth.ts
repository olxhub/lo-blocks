// Auth identity resolution for incoming WebSocket connections.
//
// Event-server reads the HTTP Basic credential from the WS upgrade request
// (nginx verifies in prod; in dev we trust local traffic) and echoes the
// resolved identity back over the socket as `{status:'auth', ...}`. That
// lets lo-blocks populate state.system.currentUser (see CurrentUser in
// types.ts) via reduxLogger.handleAuth.
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

import { generateGuestName } from '@/lib/util/guestNames';
import { quotePlus } from '@/lib/util/quotePlus';

export interface AuthUser {
  user_id: string;
  provenance: string;
  safe_user_id: string;
  authorized: boolean;
  [key: string]: any;
}

/**
 * Build a provenance-prefixed, URL-safe storage key from auth source and
 * raw user ID. Mirrors Learning Observer's auth.events.encode_id so blobs
 * keyed by either server land at byte-identical paths.
 */
function encodeId(source: string, unsafeId: string): string {
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
 * Resolve the user identity for an incoming WS connection.
 *
 * HTTP Basic path: use the username verbatim, provenance='nginx'.
 * Fallback: mint a fresh friendly guest name via generateGuestName,
 *   provenance='guest', unauthorized. Note that guest identity is
 *   ephemeral-per-connection today; see guestNames/index.ts for the
 *   scaffolding story and upgrade path.
 */
export function resolveUser(req: { headers: { authorization?: string } }): AuthUser {
  const username = parseBasicAuth(req.headers.authorization);
  if (username !== null) {
    return {
      user_id: username,
      provenance: 'nginx',
      safe_user_id: encodeId('nginx', username),
      authorized: true,
    };
  }
  const guestName = generateGuestName();
  return {
    user_id: guestName,
    provenance: 'guest',
    safe_user_id: encodeId('guest', guestName),
    authorized: false,
  };
}
