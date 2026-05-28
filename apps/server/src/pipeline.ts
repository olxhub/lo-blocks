// Event processing pipeline for incoming WebSocket messages.
//
// Architecture mirrors Learning Observer's incoming_student_event.py:
// a chain of async generators, each receiving events from the previous
// stage, transforming/filtering, and yielding to the next.
//
//   raw messages → decode & log → lock fields → auth → blobs → reducers
//
// Today, only decodeAndLog does real work; the rest are identity
// pass-throughs. But the pipeline shape is established so that each
// stage can grow independently without restructuring.
//
// Why async generators:
//   - Each stage is independently testable
//   - Adding a stage is additive (no rewriting)
//   - Backpressure is natural (pull-based)
//   - The auth stage can buffer pre-auth events and replay them
//     without the rest of the pipeline knowing or caring
//
// See LO's incoming_student_event.py for the mature Python version
// and the design rationale for each stage.

import type { WebSocket } from 'ws';
import type { AuthUser } from './auth.js';
import type { ConnectionLog } from './eventLog.js';
import { saveConnectionLog } from './eventLog.js';
import type { KVStore } from './kvs.js';
import type { SafeUserId } from '@/lib/types/identity';
import { kvsKey } from '@/lib/types/identity';
import { ServerState } from './serverState.js';

/** Parsed event from the client. Loose shape for now. */
export interface PipelineEvent {
  event?: string;
  type?: string;
  [key: string]: any;
}

/** Context threaded through the pipeline — immutable per-connection state. */
export interface PipelineContext {
  ws: WebSocket;
  user: AuthUser;
  conn: ConnectionLog;
  kvs: KVStore;
  serverState?: ServerState;
}

// =============================================================================
// Stage 0: Raw messages from WebSocket → parsed events
// =============================================================================

/** Yield parsed JSON events from the WebSocket. Closes when the socket closes. */
async function* messagesFrom(ws: WebSocket): AsyncGenerator<PipelineEvent> {
  // Bridge the callback-based ws API into an async generator.
  // Events are queued; the generator pulls them one at a time.
  const queue: PipelineEvent[] = [];
  let done = false;
  let resolve: (() => void) | null = null;

  ws.on('message', (data: Buffer) => {
    try {
      queue.push(JSON.parse(data.toString()));
    } catch (e) {
      console.error('Failed to parse event:', e);
      return;
    }
    if (resolve) { resolve(); resolve = null; }
  });

  ws.on('close', () => { done = true; if (resolve) { resolve(); resolve = null; } });
  ws.on('error', () => { done = true; if (resolve) { resolve(); resolve = null; } });

  while (true) {
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    if (done) return;
    await new Promise<void>(r => { resolve = r; });
    if (done && queue.length === 0) return;
  }
}

// =============================================================================
// Stage 1: Decode and log
// =============================================================================

/** Log each event to the connection log and save to disk. */
async function* decodeAndLog(
  events: AsyncIterable<PipelineEvent>,
  ctx: PipelineContext
): AsyncGenerator<PipelineEvent> {
  for await (const event of events) {
    ctx.conn.log.events.push(event);
    saveConnectionLog(ctx.conn);

    const eventType = event.event || event.type || 'unknown';
    const id = event.id ? ` id=${event.id}` : '';
    console.log(`[${ctx.conn.id}:${ctx.conn.log.events.length}] ${eventType}${id}`);

    yield event;
  }
}

// =============================================================================
// Stage 2: Lock fields (source metadata)
// =============================================================================

// In LO, lock_fields events declare the client's source identifier and
// other per-session metadata. These fields are stripped from the stream
// and attached to all subsequent events. For now, pass-through.

async function* decodeLockFields(
  events: AsyncIterable<PipelineEvent>,
  _ctx: PipelineContext
): AsyncGenerator<PipelineEvent> {
  // TODO: extract lock_fields events, attach to subsequent events.
  for await (const event of events) {
    yield event;
  }
}

// =============================================================================
// Stage 3: Auth
// =============================================================================

// Today: identity is resolved from the HTTP upgrade request before the
// pipeline starts. This stage is a pass-through.
//
// Future: for auth flows where identity arrives as an in-stream event
// (e.g., embedded iframe posting a token, LTI deep linking, log replay),
// this stage buffers pre-auth events into a backlog, resolves identity
// when the auth event arrives, then replays the backlog with auth
// metadata attached. See LO's handle_auth_events for the full pattern.
//
// Key concerns when this grows:
//   - Backlog: events before auth must be buffered, not dropped
//   - Credential stripping: auth tokens must not persist in event logs
//   - Timeout: don't buffer forever if auth never arrives

async function* resolveAuth(
  events: AsyncIterable<PipelineEvent>,
  _ctx: PipelineContext
): AsyncGenerator<PipelineEvent> {
  // TODO: backlog + in-stream auth resolution
  for await (const event of events) {
    yield event;
  }
}

// =============================================================================
// Stage 4: Blob storage (save/fetch)
// =============================================================================

// Handles save_blob and fetch_blob events — the client's persistence
// mechanism. save_blob writes the Redux state snapshot to the KVS;
// fetch_blob retrieves it and sends it back over the WebSocket.
// Non-blob events pass through unchanged.
//
// Wire protocol (matching lo_event's websocketLogger/reduxLogger):
//   Client → Server:
//     { event: "fetch_blob", reduxID: "default" }
//     { event: "save_blob", blob: { ...reduxState } }
//   Server → Client:
//     { status: "fetch_blob", data: { ...reduxState } | null }

function blobKey(safeUserId: SafeUserId, reduxID: string) {
  return kvsKey.blob(safeUserId, reduxID);
}

async function* handleBlobs(
  events: AsyncIterable<PipelineEvent>,
  ctx: PipelineContext
): AsyncGenerator<PipelineEvent> {
  const { ws, user, kvs } = ctx;
  // Track the active reduxID — set by save_setting or fetch_blob events.
  // Falls back to "default" if the client never sends one.
  let activeReduxID = 'default';

  for await (const event of events) {
    const eventType = event.event || event.type;

    if (eventType === 'save_setting' && event.reduxID) {
      activeReduxID = event.reduxID;
      // save_setting also flows downstream (it sets lock fields metadata)
      yield event;
      continue;
    }

    if (eventType === 'fetch_blob') {
      const reduxID = event.reduxID || activeReduxID;
      activeReduxID = reduxID;
      const key = blobKey(user.safe_user_id, reduxID);
      try {
        const raw = await kvs.get(key);
        const data = raw ? JSON.parse(raw) : null;
        ws.send(JSON.stringify({ status: 'fetch_blob', data }));
        console.log(`[${ctx.conn.id}] fetch_blob ${key}: ${raw ? `${raw.length} bytes` : 'empty'}`);
      } catch (err) {
        console.error(`[${ctx.conn.id}] fetch_blob error:`, err);
        ws.send(JSON.stringify({ status: 'fetch_blob', data: null }));
      }
      // fetch_blob is consumed here — not yielded downstream
      continue;
    }

    if (eventType === 'save_blob') {
      const key = blobKey(user.safe_user_id, activeReduxID);
      try {
        const blob = JSON.stringify(event.blob);
        await kvs.set(key, blob);
        console.log(`[${ctx.conn.id}] save_blob ${key}: ${blob.length} bytes`);
      } catch (err) {
        console.error(`[${ctx.conn.id}] save_blob error:`, err);
      }
      // save_blob is consumed here — not yielded downstream
      continue;
    }

    yield event;
  }
}

// =============================================================================
// Stage 5: Reducers
// =============================================================================

// Server-side reducers: apply the same field reducers that run on the
// client, producing a server-authoritative state. Enables conflict
// resolution, validation, and eventually CRDT merging.

async function* runReducers(
  events: AsyncIterable<PipelineEvent>,
  ctx: PipelineContext
): AsyncGenerator<PipelineEvent> {
  const serverState = new ServerState();
  ctx.serverState = serverState;

  for await (const event of events) {
    serverState.dispatch(event);
    yield event;
  }
}

// =============================================================================
// Pipeline assembly
// =============================================================================

/**
 * Run the full event pipeline for a WebSocket connection.
 * Returns when the connection closes.
 */
export async function runPipeline(ctx: PipelineContext) {
  const raw = messagesFrom(ctx.ws);
  const logged = decodeAndLog(raw, ctx);
  const withLockFields = decodeLockFields(logged, ctx);
  const authenticated = resolveAuth(withLockFields, ctx);
  const withBlobs = handleBlobs(authenticated, ctx);
  const reduced = runReducers(withBlobs, ctx);

  // Drain the pipeline — pull events through all stages until the
  // connection closes.
  for await (const _ of reduced) {
    // Each stage does its own work; nothing to do at the end.
  }
}
