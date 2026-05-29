// JWT-based session cookies.
//
// Provides stable identity across page refreshes without requiring
// external auth. The JWT is signed (not encrypted) — the client can
// read it (for preferences like language/theme) but can't forge it.
//
// Flow:
//   1. First HTTP request: no cookie → resolveUser mints identity →
//      response sets lo_session cookie with signed JWT
//   2. Subsequent requests (including WS upgrade): cookie present →
//      verify signature → reuse identity
//   3. Basic auth always wins over cookie (production path via nginx)

import * as jose from 'jose';
import fs from 'fs';
import path from 'path';
import { resolveBasicAuth, createGuestUser, type AuthUser } from './auth.js';
import { asUserId, asSafeUserId } from '@/lib/types/identity';

const COOKIE_NAME = 'lo_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// --- Secret key management ---------------------------------------------------
// Use SESSION_SECRET env var if set, otherwise generate and persist to disk.
// The persisted key survives server restarts so existing cookies remain valid.

function loadOrCreateSecret(): Uint8Array {
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret) {
    return new TextEncoder().encode(envSecret);
  }

  const keyPath = path.resolve('./data/session.key');
  try {
    const existing = fs.readFileSync(keyPath);
    return new Uint8Array(existing);
  } catch {
    // Generate a new 256-bit secret
    const secret = crypto.getRandomValues(new Uint8Array(32));
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, Buffer.from(secret), { mode: 0o600 });
    console.log('Generated new session secret at', keyPath);
    return secret;
  }
}

const SECRET = loadOrCreateSecret();

// --- JWT operations ----------------------------------------------------------

/** Sign an AuthUser into a JWT string. */
export async function createSessionToken(user: AuthUser): Promise<string> {
  return await new jose.SignJWT({
    user_id: user.user_id,
    provenance: user.provenance,
    safe_user_id: user.safe_user_id,
    authorized: user.authorized,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(SECRET);
}

/** Verify a JWT and return the AuthUser, or null if invalid/expired. */
export async function verifySessionToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jose.jwtVerify(token, SECRET);
    if (!payload.user_id || !payload.safe_user_id) return null;
    return {
      user_id: asUserId(payload.user_id as string),
      provenance: (payload.provenance as string) ?? 'session',
      safe_user_id: asSafeUserId(payload.safe_user_id as string),
      authorized: (payload.authorized as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

// --- Cookie helpers ----------------------------------------------------------

/** Extract the lo_session token from a raw Cookie header string. */
export function parseCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

/** Build the Set-Cookie header value for a session token. */
export function buildSetCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${MAX_AGE_SECONDS}`;
}

export { COOKIE_NAME };

// --- User resolution ---------------------------------------------------------
// Priority: HTTP Basic auth > session cookie > new guest.
// Returns the user and whether a new session cookie should be set.

export async function resolveUserWithSession(
  req: { headers: { authorization?: string; cookie?: string } }
): Promise<{ user: AuthUser; needsCookie: boolean }> {
  const basicUser = resolveBasicAuth(req);
  if (basicUser) return { user: basicUser, needsCookie: false };

  const token = parseCookie(req.headers.cookie);
  if (token) {
    const sessionUser = await verifySessionToken(token);
    if (sessionUser) return { user: sessionUser, needsCookie: false };
  }

  return { user: createGuestUser(), needsCookie: true };
}
