#!/usr/bin/env npx tsx
// packages/shared/scripts/event-server.ts
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

import { type AuthUser, resolveUser } from '../lib/util/auth';

const PORT = 8888;
const WS_PATH = '/wsapi/in/';
const EVENTS_DIR = 'events';

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
