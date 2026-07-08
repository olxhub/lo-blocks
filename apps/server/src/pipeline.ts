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
import { appendEvent } from './eventLog.js';
import type { KVStore } from './kvs.js';
import { kvsKey } from '@/lib/types/identity';
import type { ServerState } from '@/lib/state/sync/materialization';
import type { FieldPersister } from '@/lib/state/sync/persistence';
import { assembleFieldState, compareToBlob } from '@/lib/state/sync/persistence';
import type { UserStateRegistry, UserStateEntry } from '@/lib/state/sync/registry';
import type { GroupingIndex } from '@/lib/state/sync/partitions';
import { userInstance } from '@/lib/state/sync/levels';
import type { SubscriptionRegistry } from '@/lib/state/sync/subscriptions';
import { routeEvent, type SyncSession } from '@/lib/state/sync/router';

/** Send a message to the client, ignoring errors if the socket is already closing. */
function safeSend(ws: WebSocket, data: object) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  } catch { /* client gone — not actionable */ }
}

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
  /** Which store serves state on fetch_blob (config: state-canonical). */
  canonical?: 'blob' | 'fields';
  /** Per-user shared state; every connection for a user folds into one
   * materialization (userState.ts). Owned by server.ts. */
  stateRegistry: UserStateRegistry;
  /** Which connections care about which blocks (content fetch =
   * subscription). Shared/server fan-out targets subscribers only. */
  subscriptions: SubscriptionRegistry;
  /** Trusted field-level declarations (fieldLevels.ts). Absent = every
   * field routes as level 'user' (fail closed). */
  fieldLevels?: import('@/lib/state/sync/fieldLevels').FieldLevelIndex;
  /** Grouping index from content (partitions.ts). Absent = no grouping
   * (tests that don't care omit it). */
  grouping?: GroupingIndex;
  /** Aggregation index from content (aggregations.ts). Absent = none. */
  aggregations?: import('@/lib/state/sync/aggregations').AggregationIndex;
  /** The connection's sync session (holdings on level instances) —
   * set by runPipeline. */
  session?: SyncSession;
  /** Aliases into the user's own entry (same objects, shared across the
   * user's connections). */
  userState?: UserStateEntry;
  serverState?: ServerState;
  persister?: FieldPersister;
}

// =============================================================================
// Stage 0: Raw messages from WebSocket → parsed events
// =============================================================================

/** Yield parsed JSON events from the WebSocket. Closes when the socket
 * closes.
 *
 * NOT an async generator function itself: generator bodies are lazy (the
 * first `next()` runs them), so listeners would attach only when the
 * drain loop first pulls — and any `await` between connection and drain
 * would drop the messages arriving in the gap. This plain function
 * attaches the listeners SYNCHRONOUSLY and returns a generator over the
 * already-live queue. */
function messagesFrom(ws: WebSocket): AsyncGenerator<PipelineEvent> {
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

  return (async function* () {
    while (true) {
      while (queue.length > 0) {
        yield queue.shift()!;
      }
      if (done) return;
      await new Promise<void>(r => { resolve = r; });
      if (done && queue.length === 0) return;
    }
  })();
}

// =============================================================================
// Stage 1: Decode and log
// =============================================================================

/** Log each event to the connection log and save to disk. */
async function* decodeAndLog(
  events: AsyncIterable<PipelineEvent>,
  context: PipelineContext
): AsyncGenerator<PipelineEvent> {
  for await (const event of events) {
    appendEvent(context.conn, event);

    const eventType = event.event || event.type || 'unknown';
    const id = event.id ? ` id=${event.id}` : '';
    console.log(`[${context.conn.id}:${context.conn.log.eventCount}] ${eventType}${id}`);

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
  _context: PipelineContext
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
  _context: PipelineContext
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
//     { event: "fetch_blob" }
//     { event: "save_blob", blob: { ...reduxState } }
//   Server → Client:
//     { status: "fetch_blob", data: { ...reduxState } | null }

async function* handleBlobs(
  events: AsyncIterable<PipelineEvent>,
  context: PipelineContext
): AsyncGenerator<PipelineEvent> {
  const { ws, user, kvs } = context;
  const key = kvsKey.blob(user.safe_user_id);

  for await (const event of events) {
    const eventType = event.event || event.type;

    if (eventType === 'fetch_blob') {
      try {
        const entry = context.userState!;
        // Seed the shared materialization from storage, once per user
        // entry (single-flight: a second tab fetching concurrently awaits
        // the same seed rather than re-seeding over live events). A
        // blob-sourced seed is adopted into the field store (migration,
        // once per user); a fields-sourced seed only rebases.
        await entry.ensureSeeded(async () => {
          let scopes: Record<string, any> | null = null;
          let source = 'blob';
          if (context.canonical === 'fields') {
            scopes = await assembleFieldState(kvs, userInstance(user.safe_user_id));
            if (scopes) source = 'fields';
            // No per-field state yet (user predates the field store):
            // fall back to the blob — adopt() below writes it into the
            // field store, so the fallback runs once per user.
          }
          if (!scopes) {
            const raw = await kvs.get(key);
            scopes = raw ? JSON.parse(raw)?.application_state ?? null : null;
          }
          if (scopes) {
            entry.serverState.seed(scopes);
            if (source === 'fields') entry.persister.startFromPersisted(entry.serverState.state);
            else entry.persister.startFromUnpersisted(entry.serverState.state);
          }
          console.log(`[${context.conn.id}] user state seeded from ${scopes ? source : 'nothing'}`);
        });
        // Serve the LIVE materialization — for a second connection this is
        // fresher than storage by up to a flush debounce, and it already
        // includes the user's other-tab events.
        const data = entry.liveState();
        safeSend(ws, { status: 'fetch_blob', data });
        // Log the response so event logs are self-contained for replay
        appendEvent(context.conn, { event: 'fetch_blob_response', data });
        console.log(`[${context.conn.id}] fetch_blob: ${data ? 'served live state' : 'empty'}`);
      } catch (err) {
        console.error(`[${context.conn.id}] fetch_blob error:`, err);
        safeSend(ws, { status: 'fetch_blob', data: null });
        appendEvent(context.conn, { event: 'fetch_blob_response', data: null });
      }
      // fetch_blob is consumed here — not yielded downstream
      continue;
    }

    if (eventType === 'save_blob') {
      try {
        const blob = JSON.stringify(event.blob);
        await kvs.set(key, blob);
        safeSend(ws, { status: 'save_blob_ack', token: event.token });
        console.log(`[${context.conn.id}] save_blob ${key}: ${blob.length} bytes`);
        // Parallel-run validation: how well does the server-materialized
        // state agree with what the client just saved? Divergence is
        // expected with multiple tabs/devices (the blob merges them, this
        // connection sees only its own events) — a signal, not an error.
        if (context.serverState) {
          console.log(`[${context.conn.id}] field-store agreement — ${
            compareToBlob(context.serverState.state, event.blob?.application_state)}`);
        }
      } catch (err) {
        console.error(`[${context.conn.id}] save_blob error:`, err);
        // Tell the client the write failed so it can surface it instead of
        // sitting at 'modified' indefinitely (indistinguishable from "saving").
        safeSend(ws, { status: 'save_blob_nack', token: event.token });
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
  context: PipelineContext
): AsyncGenerator<PipelineEvent> {
  // The whole reducer stage is one library call: fold the event into the
  // right level instance and deliver (@/lib/state/sync/router).
  for await (const event of events) {
    await routeEvent(context.session!, event);
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
export async function runPipeline(context: PipelineContext) {
  // The connection's sync session: a map of held LEVEL INSTANCES
  // (router.ts). The user's own instance is acquired eagerly — all of a
  // user's connections fold into one materialization; further instances
  // (all, set:…) are acquired lazily by the router.
  const session: SyncSession = {
    origin: context.ws,
    principal: context.user.safe_user_id,
    registry: context.stateRegistry,
    subscriptions: context.subscriptions,
    kvs: context.kvs,
    fieldLevels: context.fieldLevels,
    grouping: context.grouping,
    aggregations: context.aggregations,
    holdings: new Map(),
  };
  context.session = session;
  const own = context.stateRegistry.acquire(userInstance(context.user.safe_user_id), context.ws);
  session.holdings.set(userInstance(context.user.safe_user_id), own);
  context.userState = own;
  context.serverState = own.serverState;
  context.persister = own.persister;
  // Content fetched before this socket existed recorded its subscription
  // keys against the principal — adopt them now (startup race; see
  // subscriptions.ts "Pending subscriptions").
  context.subscriptions.adoptPending(context.user.safe_user_id, context.ws);

  // The message listener must attach SYNCHRONOUSLY with the connection —
  // an await before messagesFrom() would drop events arriving in the gap
  // (same race the upgrade handler documents in server.ts). messagesFrom
  // queues; the stages below await freely.
  const raw = messagesFrom(context.ws);
  try {
    const logged = decodeAndLog(raw, context);
    const withLockFields = decodeLockFields(logged, context);
    const authenticated = resolveAuth(withLockFields, context);
    const withBlobs = handleBlobs(authenticated, context);
    const reduced = runReducers(withBlobs, context);

    // Drain the pipeline — pull events through all stages until the
    // connection closes.
    for await (const _ of reduced) {
      // Each stage does its own work; nothing to do at the end.
    }
  } finally {
    // Runs on normal close AND when a stage throws (a malformed event,
    // say): without it, a crashed pipeline leaked its registry refs
    // (phantom live entries), its subscriptions, and its pending field
    // writes (found by review 2026-07). Every held instance releases —
    // the last holder's release flushes and drops the entry.
    context.subscriptions.unsubscribeAll(context.ws);
    for (const entry of session.holdings.values()) await entry.release();
  }
}
