// Event log — persists per-connection event streams to disk.
//
// Each WebSocket connection gets a ConnectionLog with a unique ID, a
// reference to the authenticated user, and an EventLog that accumulates
// events and is written to disk as JSON on every event and on shutdown.
//
// This is NOT an auth session (cookies, tokens, etc.). It's a debug/replay
// artifact: the JSON files in events/ can be replayed via the debug panel.

import * as fs from 'fs';
import * as path from 'path';
import type { AuthUser } from './auth.js';

const EVENTS_DIR = 'events';

// Ensure events directory exists
fs.mkdirSync(EVENTS_DIR, { recursive: true });

export interface EventLog {
  description: string;
  started: string;
  user: AuthUser;
  events: any[];
}

export interface ConnectionLog {
  id: string;
  user: AuthUser;
  log: EventLog;
  path: string;
}

let connectionCounter = 0;

export function createConnectionLog(user: AuthUser): ConnectionLog {
  const id = `${Date.now()}-${++connectionCounter}`;
  // Include the user's safe_user_id in the filename so logs for the same
  // user cluster together on disk and are greppable.
  const userTag = user.safe_user_id || `unknown-${connectionCounter}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `events-${timestamp}-${userTag}-${connectionCounter}.json`;
  const logPath = path.join(EVENTS_DIR, filename);

  const log: EventLog = {
    description: 'Captured event stream',
    started: new Date().toISOString(),
    user,
    events: []
  };

  return { id, user, log, path: logPath };
}

export function saveConnectionLog(conn: ConnectionLog) {
  fs.writeFileSync(conn.path, JSON.stringify(conn.log, null, 2));
}
