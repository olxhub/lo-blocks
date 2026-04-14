#!/usr/bin/env npx tsx
// src/scripts/event-server.ts
//
// Lightweight WebSocket server for capturing lo_event streams in dev.
//
// Usage:
//   npx tsx src/scripts/event-server.ts
//   npx tsx src/scripts/event-server.ts --output events-$(date +%Y%m%d-%H%M%S).json
//
// Then enable websocketLogger in store.ts (uncomment line ~179).
//
// Events are saved in replay-compatible format: { description, events: [...] }
//

import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';

import { generateGuestName } from '../lib/util/guestNames';
import { quotePlus } from '../lib/util/quotePlus';

const PORT = 8888;
const WS_PATH = '/wsapi/in/';
const EVENTS_DIR = 'events';

// =============================================================================
// Auth identity
// =============================================================================
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
//                  persistence; mirrors LO's auth.events.encode_id so blobs
//                  land at byte-identical keys on both servers.
//
// When we add richer auth (LTI, OAuth), this block grows; the WS payload
// shape stays the same thanks to the client's spread-based forward-compat.
// =============================================================================

interface AuthUser {
  user_id: string;
  provenance: string;
  safe_user_id: string;
  authorized: boolean;
  [key: string]: any;
}

/** Provenance-prefixed, URL-safe storage key. Mirrors LO's auth.events.encode_id. */
function encodeId(source: string, unsafeId: string): string {
  return `${source}-${quotePlus(unsafeId)}`;
}

/**
 * Parse an Authorization header for HTTP Basic and return the username, or
 * null if the header is absent or not a Basic credential. We do NOT verify
 * the password — in prod nginx handles verification; in dev we trust local
 * traffic.
 */
function parseBasicAuth(authHeader: string | undefined): string | null {
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
 *   ephemeral-per-connection today; see scripts/guestNames/index.ts
 *   for the scaffolding story and upgrade path.
 */
function resolveUser(req: { headers: { authorization?: string } }): AuthUser {
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

// Ensure events directory exists
fs.mkdirSync(EVENTS_DIR, { recursive: true });

interface EventLog {
  description: string;
  started: string;
  user: AuthUser;
  events: any[];
}

interface Session {
  id: string;
  user: AuthUser;
  log: EventLog;
  path: string;
}

let sessionCounter = 0;

function createSession(user: AuthUser): Session {
  const id = `${Date.now()}-${++sessionCounter}`;
  // Include the user's safe_user_id in the filename so sessions for the same
  // user cluster together on disk and are greppable. Fall back to the bare
  // counter if something goes wrong (shouldn't happen, but keeps the path
  // safe if a future auth source produces an empty safe_user_id).
  const userTag = user.safe_user_id || `unknown-${sessionCounter}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `events-${timestamp}-${userTag}-${sessionCounter}.json`;
  const sessionPath = path.join(EVENTS_DIR, filename);

  const log: EventLog = {
    description: 'Captured event stream',
    started: new Date().toISOString(),
    user,
    events: []
  };

  return { id, user, log, path: sessionPath };
}

function saveSession(session: Session) {
  fs.writeFileSync(session.path, JSON.stringify(session.log, null, 2));
}

// Track active sessions for clean shutdown
const activeSessions = new Map<WebSocket, Session>();

// Save on exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  for (const session of activeSessions.values()) {
    saveSession(session);
    console.log(`Saved ${session.log.events.length} events to ${session.path}`);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  for (const session of activeSessions.values()) {
    saveSession(session);
  }
  process.exit(0);
});

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT, path: WS_PATH });

console.log(`Event server listening on ws://localhost:${PORT}${WS_PATH}`);
console.log(`Saving events to: ${EVENTS_DIR}/`);
console.log('Press Ctrl+C to stop and save.\n');

wss.on('connection', (ws: WebSocket, req) => {
  const user = resolveUser(req as any);
  const session = createSession(user);
  activeSessions.set(ws, session);
  console.log(
    `[${session.id}] ${user.user_id} (${user.provenance}) connected from ` +
    `${req.socket.remoteAddress} → ${session.path}`
  );

  // Echo the resolved identity back to the client. websocketLogger will stash
  // this in its storage shim and dispatch a DOM CustomEvent; reduxLogger
  // consumes that event and populates state.system.currentUser via the
  // settings.currentUser field. The client treats `user_id` as the only
  // required field; everything else is spread-through forward-compat.
  ws.send(JSON.stringify({ status: 'auth', ...user }));

  ws.on('message', (data: Buffer) => {
    try {
      const message = data.toString();
      const event = JSON.parse(message);
      session.log.events.push(event);
      saveSession(session);  // Stream to file immediately

      // Log event type for visibility
      const eventType = event.event || event.type || 'unknown';
      const id = event.id ? ` id=${event.id}` : '';
      console.log(`[${session.id}:${session.log.events.length}] ${eventType}${id}`);
    } catch (e) {
      console.error('Failed to parse event:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[${session.id}] Client disconnected - ${session.log.events.length} events saved`);
    saveSession(session);
    activeSessions.delete(ws);
  });

  ws.on('error', (err) => {
    console.error(`[${session.id}] WebSocket error:`, err);
  });
});

wss.on('error', (err) => {
  if ((err as any).code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is another event-server running?`);
    process.exit(1);
  }
  console.error('Server error:', err);
});
