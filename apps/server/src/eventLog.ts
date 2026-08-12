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
  /** Resolves when every byte zlib has emitted SO FAR has been written to
   *  the file descriptor. Reassigned by the pump on each compressed chunk;
   *  awaiting the latest one covers all earlier ones, because a Writable
   *  fires its write callbacks in write order. This is what makes
   *  appendEventDurable's promise mean "in the file" (see below). */
  fileWritten: Promise<void>;
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

  const conn: ConnectionLog = {
    id, user, log, path: logPath, stream: gzip, fileStream,
    fileWritten: Promise.resolve(),
  };

  // Pump the compressed bytes to the file by hand rather than
  // gzip.pipe(fileStream). pipe() hands back no handle on the file write,
  // so a "durable" append could only ever await zlib — and zlib finishing
  // says nothing about the fd. Measured before this change: after
  // appendEventDurable resolved (i.e. at the moment the server acks), the
  // log file was still zero bytes ~28% of the time, and occasionally had
  // not been created at all, since fs.createWriteStream opens the fd
  // asynchronously. The pump below tracks the file write so
  // appendEventDurable can await it, which is the whole ack contract.
  //
  // Deliberately NO backpressure pause here. Pausing gzip stops 'data' from
  // firing, so flushed bytes stay in gzip's readable buffer while
  // `conn.fileWritten` still points at some EARLIER chunk's write. That
  // promise resolves, appendEventDurable resolves, and the server acks an
  // event whose bytes were never handed to fileStream.write() at all — a
  // false ack, which is the exact class of bug this pump was written to fix.
  // (Reachable with a large event, e.g. CONTENT_PARSED, or a burst before the
  // fd finishes opening.)
  //
  // Letting the writable buffer instead is CORRECT because write callbacks fire
  // in order: awaiting the last chunk's callback therefore also means every
  // earlier chunk landed. That is the whole guarantee, and it does not depend
  // on how many writes are outstanding.
  //
  // It is not, however, a memory BOUND. appendEvent (non-durable) is
  // fire-and-forget, and pipeline.ts logs fetch_blob_response through it with a
  // whole state blob attached, so more than one event's compressed output can
  // be in the writable at once. Bounded in practice by how fast that path can
  // produce, which is a per-connection request, not a stream. If that ever
  // stops being true, the fix is to give appendEvent backpressure of its own —
  // NOT to pause gzip, which is what broke the ack contract here.
  gzip.on('data', (chunk: Buffer) => {
    conn.fileWritten = new Promise<void>((resolve) => {
      // Capture the write error HERE, before resolving — not only via the
      // 'error' handlers below. appendEventDurable checks conn.streamError
      // after awaiting this promise, and the 'error' event reaches that check
      // first only because Node currently emits it on process.nextTick (which
      // drains before promise microtasks). That is internal scheduling, not a
      // contract; setting streamError in the callback makes "no false ack on
      // write failure" hold locally, whatever the emit ordering. Still resolve
      // unconditionally so nothing awaits forever — callers check streamError.
      fileStream.write(chunk, (err) => {
        if (err && !conn.streamError) conn.streamError = err;
        resolve();
      });
    });
  });
  // pipe() also forwarded end-of-stream; saveConnectionLog ends the gzip,
  // and the file closes once its last chunk is out.
  gzip.once('end', () => fileStream.end());

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
  conn.stream.write(JSON.stringify(event) + '\n');
  // Counted AFTER the write is issued, matching appendEventDurable — the two
  // feed one counter that saveConnectionLog and the disconnect line report as
  // a single number, so they must mean the same thing. (Durable waits for the
  // bytes to land; this path cannot, being fire-and-forget. Both now count
  // "handed to the stream without throwing" at the earliest.)
  conn.log.eventCount++;
}

/** Append a single event AND flush it through zlib into the file, resolving
 *  once the event's bytes have been written to the file descriptor.
 *
 *  This is the Plane-1 ack trigger (see docs/README.md, section "State, Events,
 *  and Synchronization"). The server must not tell the client "durably
 *  captured" until the event is in the events/ log — not merely folded into
 *  in-memory ServerState. The bug being fixed is exactly the window where an
 *  event lives only in a JS variable + the network buffer: acking before the
 *  log write reintroduces it.
 *
 *  What this does and does NOT guarantee:
 *  Z_SYNC_FLUSH ends a deflate block and pushes this event's bytes out of
 *  zlib; the pump in createConnectionLog then writes them to the fd, and we
 *  await THAT (conn.fileWritten) before resolving. So on resolution the event
 *  is in the file, and it survives a tab close and an in-process server crash
 *  — the bug this fixes. It does NOT fsync, so it does not guarantee survival
 *  of a machine crash / power loss (that needs fdatasync). "ack" means
 *  "written to the events/ log", not "fsynced" and not "processed".
 *
 *  Awaiting the fd write is load-bearing, not belt-and-braces: resolving on
 *  the zlib flush alone left the file empty ~28% of the time at ack, because
 *  fs.createWriteStream opens the fd asynchronously and its queued writes
 *  complete later still. That made "ack" mean "in a JS buffer" — exactly the
 *  failure mode Plane 1 exists to remove.
 *
 *  Ending the deflate block also makes every byte written so far independently
 *  decompressible — a reader (or a crash-truncated file) recovers all acked
 *  events even though the gzip trailer isn't written until saveConnectionLog().
 *
 *  TODO(plane1-durability, separate PR): batch the flush. Today every event is
 *  flushed individually — one Z_SYNC_FLUSH plus a file write and two
 *  event-loop round-trips per event, a real compression/perf cost at keystroke
 *  volume. The rework: drain the pending queue → append all → ONE durable sync
 *  → then ack EVERY event in the batch, by name, on a ~500ms boundary;
 *  optionally fsync on that boundary behind a plain `const FSYNC = false`
 *  module toggle for machine-crash durability.
 *
 *  Acking only the newest event of the batch would NOT be equivalent. Acks name
 *  the event, not a position in a stream (see pipeline.ts) — there is no "and
 *  everything before it" to infer, precisely because the client outbox is
 *  shared across tabs, so a per-connection position means nothing to it. A
 *  batch that acks one name leaves the rest retained in the client outbox
 *  forever, which is an unbounded queue rather than a lost event: quieter than
 *  data loss, and harder to notice.
 *  This is server-crash hardening, NOT the tab-close fix (that's the persistent
 *  client queue — see queueType in packages/shared/lib/state/store.ts). */
export function appendEventDurable(conn: ConnectionLog, event: any): Promise<void> {
  if (conn.streamError) return Promise.reject(conn.streamError);
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
        if (conn.streamError) return reject(conn.streamError);
        // zlib emits the flushed bytes BEFORE invoking this callback, so
        // conn.fileWritten already covers this event; awaiting it is what
        // makes the resolution mean "in the file" rather than merely
        // "out of zlib".
        conn.fileWritten.then(() => {
          if (conn.streamError) return reject(conn.streamError);
          // Count only after the write lands: incrementing before a write
          // that could fail would drift the count on a stream error.
          conn.log.eventCount++;
          resolve();
        });
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
