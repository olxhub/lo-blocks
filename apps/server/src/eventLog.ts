// Event log — persists per-connection event streams to disk.
//
// Each WebSocket connection gets a ConnectionLog with a unique ID, a
// reference to the authenticated user, and a gzip stream. Events are
// appended as NDJSON lines to the stream.
//
// This is NOT an auth session (cookies, tokens, etc.). It's a debug/replay
// artifact: the gzipped files in events/ can be read with zcat.

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { AuthUser } from './auth.js';

const EVENTS_DIR = 'events';

// Ensure events directory exists
fs.mkdirSync(EVENTS_DIR, { recursive: true });

export interface EventLog {
  description: string;
  started: string;
  user: AuthUser;
  eventCount: number;
}

export interface ConnectionLog {
  id: string;
  user: AuthUser;
  log: EventLog;
  path: string;
  stream: zlib.Gzip;
  fileStream: fs.WriteStream;
  /** First mid-session stream error, if any. */
  streamError?: Error;
  /** Set by saveConnectionLog; makes repeated calls idempotent. */
  savePromise?: Promise<void>;
}

let connectionCounter = 0;

export function createConnectionLog(user: AuthUser): ConnectionLog {
  const id = `${Date.now()}-${++connectionCounter}`;
  const userTag = user.safe_user_id || `unknown-${connectionCounter}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `events-${timestamp}-${userTag}-${connectionCounter}.jsonl.gz`;
  const logPath = path.join(EVENTS_DIR, filename);

  const log: EventLog = {
    description: 'Captured event stream',
    started: new Date().toISOString(),
    user,
    eventCount: 0
  };

  const gzip = zlib.createGzip();
  const fileStream = fs.createWriteStream(logPath);
  gzip.pipe(fileStream);

  const conn: ConnectionLog = { id, user, log, path: logPath, stream: gzip, fileStream };

  // Handle mid-session write errors (ENOSPC, EACCES, etc.) so they don't
  // crash the whole server as uncaught exceptions. Store the first error so
  // saveConnectionLog can reject immediately instead of hanging.
  const onStreamError = (err: Error) => {
    if (!conn.streamError) conn.streamError = err;
    console.error(`[${id}] Event log stream error (${logPath}):`, err.message);
  };
  gzip.on('error', onStreamError);
  fileStream.on('error', onStreamError);

  // Write header line with connection metadata
  const header = { event: 'ndjson_header', description: log.description, started: log.started, user };
  gzip.write(JSON.stringify(header) + '\n');

  return conn;
}

/** Append a single event to the gzip stream. Fire-and-forget: the bytes
 *  sit in zlib's internal buffer until a later flush (a full write, or a
 *  durable append) pushes them to the file. Use for server-generated log
 *  entries (e.g. fetch_blob_response) that nothing acks. */
export function appendEvent(conn: ConnectionLog, event: any) {
  conn.log.eventCount++;
  conn.stream.write(JSON.stringify(event) + '\n');
}

/** Append a single event AND flush it through zlib to the underlying file,
 *  resolving only once the compressed bytes are on disk.
 *
 *  This is the Plane-1 ack trigger (pubsub-state-sync-design §3a/§7). The
 *  server must not tell the client "durably captured" until the event is
 *  actually in the events/ log — not merely folded into in-memory
 *  ServerState. The bug being fixed is exactly the window where an event
 *  lives only in a JS variable + the network buffer: acking before the
 *  disk write reintroduces it.
 *
 *  Z_SYNC_FLUSH ends a deflate block, so every byte written so far is
 *  independently decompressible — a reader (or a crash-truncated file)
 *  recovers all acked events even though the gzip trailer isn't written
 *  until saveConnectionLog(). The flush callback fires after the flushed
 *  bytes have reached the file stream, so ack-after-resolve is strictly
 *  ordered log-write-then-ack. */
export function appendEventDurable(conn: ConnectionLog, event: any): Promise<void> {
  if (conn.streamError) return Promise.reject(conn.streamError);
  conn.log.eventCount++;
  return new Promise((resolve, reject) => {
    // Flush from INSIDE the write callback: zlib processes write/flush
    // requests off an async queue, and flushing before this write is
    // consumed can emit only the previously-buffered bytes — leaving this
    // very event unflushed (and thus not yet durable) until the next write.
    // The write callback fires once the chunk is consumed, so the following
    // Z_SYNC_FLUSH is guaranteed to push THIS event's bytes to the file.
    conn.stream.write(JSON.stringify(event) + '\n', (writeErr) => {
      if (writeErr) return reject(writeErr);
      conn.stream.flush(zlib.constants.Z_SYNC_FLUSH, () => {
        if (conn.streamError) reject(conn.streamError);
        else resolve();
      });
    });
  });
}

/** Flush and close the gzip stream. Call on disconnect / shutdown.
 *  Idempotent — repeated calls return the same promise.
 *  Returns a promise that resolves when all data has been written to disk. */
export function saveConnectionLog(conn: ConnectionLog): Promise<void> {
  if (conn.savePromise) return conn.savePromise;
  if (conn.streamError) {
    conn.savePromise = Promise.reject(conn.streamError);
    return conn.savePromise;
  }
  conn.savePromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      conn.stream.removeListener('error', onError);
      conn.fileStream.removeListener('error', onError);
      conn.fileStream.removeListener('finish', onFinish);
    };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const onFinish = () => { cleanup(); resolve(); };
    conn.stream.on('error', onError);
    conn.fileStream.on('error', onError);
    conn.fileStream.on('finish', onFinish);
    conn.stream.end();
  });
  return conn.savePromise;
}
