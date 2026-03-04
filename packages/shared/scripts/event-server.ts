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

const PORT = 8888;
const WS_PATH = '/wsapi/in/';
const EVENTS_DIR = 'events';

// Ensure events directory exists
fs.mkdirSync(EVENTS_DIR, { recursive: true });

interface EventLog {
  description: string;
  started: string;
  events: any[];
}

interface Session {
  id: string;
  log: EventLog;
  path: string;
}

let sessionCounter = 0;

function createSession(): Session {
  const id = `${Date.now()}-${++sessionCounter}`;
  const filename = `events-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${sessionCounter}.json`;
  const sessionPath = path.join(EVENTS_DIR, filename);

  const log: EventLog = {
    description: 'Captured event stream',
    started: new Date().toISOString(),
    events: []
  };

  return { id, log, path: sessionPath };
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
  const session = createSession();
  activeSessions.set(ws, session);
  console.log(`[${session.id}] Client connected from ${req.socket.remoteAddress} → ${session.path}`);

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
