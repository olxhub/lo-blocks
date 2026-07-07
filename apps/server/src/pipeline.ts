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
import type { SafeUserId } from '@/lib/types/identity';
import { kvsKey } from '@/lib/types/identity';
import type { ServerState } from './serverState.js';
import type { FieldPersister } from './fieldStore.js';
import { assembleFieldState, compareToBlob } from './fieldStore.js';
import type { UserStateRegistry, UserStateEntry } from './userState.js';
import type { GroupingIndex } from './groups.js';
import { SHARED_STATE_ID } from './userState.js';
import type { SubscriptionRegistry } from './subscriptions.js';
import { parsePartitionSpec, groupFor, partitionedId } from './groups.js';

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
  /** Grouping index from content (groups.ts). Absent = no grouping
   * (tests that don't care omit it). */
  grouping?: GroupingIndex;
  /** The acquired per-user entry — set by runPipeline. */
  userState?: UserStateEntry;
  /** The acquired SHARED entry (authority: 'shared' fields fold here;
   * every connection attaches — fields-design 2c). Set by runPipeline. */
  sharedState?: UserStateEntry;
  /** Aliases into userState (same objects, shared across the user's
   * connections). */
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
            scopes = await assembleFieldState(kvs, user.safe_user_id);
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

/**
 * Resolve which SHARED bucket an authority event belongs to. Grouped
 * blocks (grouped-by attribute) partition by the SENDER's own per-user
 * state — the partition never comes from the wire (groups.ts). Ungrouped
 * blocks, and users who haven't picked yet, use the plain block id.
 */
async function resolvePartitionKey(context: PipelineContext, blockId: string): Promise<string> {
  const spec = context.grouping ? await context.grouping.specOf(blockId) : undefined;
  if (!spec) return blockId;
  const parsed = parsePartitionSpec(spec, blockId);
  const group = parsed
    ? groupFor(context.userState!.serverState.state as any, parsed)
    : undefined;
  return group !== undefined ? partitionedId(blockId, group) : blockId;
}

/**
 * Who should hear about an authority event: the connections subscribed
 * to its partition (content fetch = subscription; writers self-subscribe
 * so a client that writes without fetching still hears responses).
 * Scoped state keys (`defId#anchor`) also reach BASE-id subscribers —
 * content fetches subscribe by definition id, so a shared field inside a
 * scoped/repeated block would otherwise only ever reach its writer
 * (found by review 2026-07).
 */
function subscribersForPartition(
  context: PipelineContext,
  eventId: string,
  partitionKey: string,
): Set<WebSocket> {
  context.subscriptions.subscribe(context.ws, [partitionKey]);
  const recipients = new Set(context.subscriptions.subscribers(partitionKey));
  const hash = eventId.indexOf('#');
  if (hash > 0) {
    const baseKey = partitionKey.replace(eventId, eventId.slice(0, hash));
    for (const sock of context.subscriptions.subscribers(baseKey)) recipients.add(sock);
  }
  return recipients;
}

/**
 * A shared or server-reduced event: fold it into the SHARED
 * materialization (one truth for everyone — never the sender's per-user
 * state), then deliver. Shared fields deliver the EVENT (recipients fold
 * it themselves; the origin already did, optimistically). Server-reduced
 * fields deliver the folded BUCKET instead — the raw contribution is
 * private, so everyone (origin included) receives only the reducer's
 * output.
 */
async function foldAndDeliverAuthorityEvent(context: PipelineContext, event: PipelineEvent) {
  const shared = context.sharedState!;
  const partitionKey = await resolvePartitionKey(context, event.id);
  // The shared materialization buckets by partition key; each CLIENT
  // keeps its plain-id bucket (it only ever sees its own partition), so
  // the folded clone is re-keyed but delivered events are not.
  shared.serverState.dispatch(
    partitionKey === event.id ? event : { ...event, id: partitionKey });
  shared.persister.stateChanged(shared.serverState.state);

  const recipients = subscribersForPartition(context, event.id, partitionKey);
  if (event.authority === 'server') {
    const bucket = (shared.serverState.state as any).component?.[partitionKey];
    if (bucket !== undefined) shared.broadcastStatePatch(event.id, bucket, recipients);
  } else {
    shared.broadcastEvent(event, context.ws, recipients);
  }
}

/**
 * A per-user event: fold it into the sender's materialization and relay
 * it to their other tabs/devices (origin excluded — it already applied
 * the event optimistically; requires tab-sync off, or siblings would
 * double-apply RGA splices). If the write hit a PICKER field that
 * partitions grouped blocks, the user's group just changed — move their
 * subscriptions and show them the new partition.
 */
async function foldAndDeliverUserEvent(context: PipelineContext, event: PipelineEvent) {
  const own = context.userState!;
  own.serverState.dispatch(event);
  own.persister.stateChanged(own.serverState.state);
  own.broadcastEvent(event, context.ws);
  if (context.grouping && event.id && event.field) {
    const regrouped = await context.grouping.groupedBlocksFor(event.id, event.field);
    for (const blockId of regrouped) await switchGroup(context, blockId);
  }
}

/**
 * A user's partition for `blockId` changed (they re-picked): move ALL
 * their sockets' subscriptions to the new partition and push its bucket
 * so their UI switches content now, not at next reload. Fields present
 * in old partitions but absent in the new bucket are blanked — otherwise
 * the old group's text would linger on screen.
 */
async function switchGroup(context: PipelineContext, blockId: string) {
  const newKey = await resolvePartitionKey(context, blockId);
  const sharedComponents = (context.sharedState!.serverState.state as any).component ?? {};
  const blanks: Record<string, any> = {};
  for (const key of Object.keys(sharedComponents)) {
    if (key !== blockId && !key.startsWith(`${blockId}::`)) continue;
    for (const field of Object.keys(sharedComponents[key] ?? {})) blanks[field] = '';
  }
  const patch = { ...blanks, ...(sharedComponents[newKey] ?? {}) };
  const sockets = context.stateRegistry.socketsOf(context.user.safe_user_id);
  for (const sock of sockets) context.subscriptions.resubscribe(sock, blockId, newKey);
  if (Object.keys(patch).length > 0) {
    context.sharedState!.broadcastStatePatch(blockId, patch, sockets);
  }
}

async function* runReducers(
  events: AsyncIterable<PipelineEvent>,
  context: PipelineContext
): AsyncGenerator<PipelineEvent> {
  for await (const event of events) {
    // Authority routing (fields-design 2c/2d): shared/server events fold
    // into the SHARED materialization; everything else into the sender's.
    if (event.authority) {
      await foldAndDeliverAuthorityEvent(context, event);
    } else {
      await foldAndDeliverUserEvent(context, event);
    }
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
  // Acquire the per-USER state — all of this user's connections fold
  // into one materialization (userState.ts).
  const userState = context.stateRegistry.acquire(context.user.safe_user_id, context.ws);
  context.userState = userState;
  context.serverState = userState.serverState;
  context.persister = userState.persister;

  // And the SHARED entry (authority: 'shared' fields — fields-design 2c).
  // Every connection attaches; seeded once from the field store (no blob
  // legacy: shared fields never lived in blobs).
  const sharedState = context.stateRegistry.acquire(SHARED_STATE_ID, context.ws);
  context.sharedState = sharedState;

  // The message listener must attach SYNCHRONOUSLY with the connection —
  // an await before messagesFrom() would drop events arriving in the gap
  // (same race the upgrade handler documents in server.ts). messagesFrom
  // queues, so awaiting the shared seed after this is safe.
  const raw = messagesFrom(context.ws);
  try {
    await sharedState.ensureSeeded(async () => {
      const scopes = await assembleFieldState(context.kvs, SHARED_STATE_ID);
      if (scopes) {
        sharedState.serverState.seed(scopes);
        sharedState.persister.startFromPersisted(sharedState.serverState.state);
      }
    });
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
    // writes (found by review 2026-07).
    context.subscriptions.unsubscribeAll(context.ws);
    await userState.release();
    await sharedState.release();
  }
}
