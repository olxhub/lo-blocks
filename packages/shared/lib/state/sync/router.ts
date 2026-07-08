// packages/shared/lib/state/sync/router.ts
//
// The sync engine's event entry point: fold one event into the right
// materialization and deliver whatever its people-axis implies. The
// server's reducer stage is one call — routeEvent(session, event) —
// and the same call would serve any other host of the engine.
//
// Routing by authority (fields-design):
//   (none)   → the sender's own materialization; relay to their other
//              tabs/devices.
//   'shared' → the SHARED materialization (partitioned by group);
//              relay the EVENT to the partition's subscribers.
//   'server' → the SHARED materialization; deliver only the folded
//              BUCKET (the reducer's output) — raw contributions are
//              private.

import type { SafeUserId } from '@/lib/types/identity';
import type { StateConnection } from './connection';
import type { UserStateRegistry, UserStateEntry } from './registry';
import type { SubscriptionRegistry } from './subscriptions';
import type { GroupingIndex } from './partitions';
import type { AggregationIndex } from './aggregations';
import { parsePartitionSpec, groupFor, partitionedId } from './partitions';

/** One connection's standing context in the sync engine — everything
 * routeEvent needs, acquired once at connect. */
export interface SyncSession {
  /** Where events from this session originate (their sender). */
  origin: StateConnection;
  /** Whose per-user state this session folds into. */
  principal: SafeUserId;
  /** The acquired per-user and shared handles (registry.acquire). */
  own: UserStateEntry;
  shared: UserStateEntry;
  registry: UserStateRegistry;
  subscriptions: SubscriptionRegistry;
  /** Partition index from content; absent = no grouping. */
  grouping?: GroupingIndex;
  /** Aggregation index from content; absent = no distant folds. */
  aggregations?: AggregationIndex;
}

/** A field event as it arrives on the wire. */
export interface SyncEvent {
  event?: string;
  id?: string;
  field?: string;
  authority?: 'shared' | 'server';
  [key: string]: any;
}

/**
 * Fold one event and deliver it. This is the whole reducer stage.
 */
export async function routeEvent(session: SyncSession, event: SyncEvent): Promise<void> {
  if (event.authority) {
    await foldAndDeliverAuthorityEvent(session, event);
  } else {
    await foldAndDeliverUserEvent(session, event);
  }
}

/**
 * Resolve which SHARED bucket an authority event belongs to. Grouped
 * blocks (grouped-by attribute) partition by the SENDER's own per-user
 * state — the partition never comes from the wire (partitions.ts).
 * Ungrouped blocks, and users who haven't picked yet, use the plain
 * block id.
 */
async function resolvePartitionKey(session: SyncSession, blockId: string): Promise<string> {
  const spec = session.grouping ? await session.grouping.specOf(blockId) : undefined;
  if (!spec) return blockId;
  const parsed = parsePartitionSpec(spec, blockId);
  const group = parsed
    ? groupFor(session.own.serverState.state as any, parsed)
    : undefined;
  return group !== undefined ? partitionedId(blockId, group) : blockId;
}

/**
 * Who should hear about an authority event: the connections subscribed
 * to its partition (content fetch = subscription; writers self-subscribe
 * so a client that writes without fetching still hears responses).
 * Scoped state keys (`defId#anchor`) also reach BASE-id subscribers —
 * content fetches subscribe by definition id, so a shared field inside a
 * scoped/repeated block would otherwise only ever reach its writer.
 */
function subscribersForPartition(
  session: SyncSession,
  eventId: string,
  partitionKey: string,
): Set<StateConnection> {
  session.subscriptions.subscribe(session.origin, [partitionKey]);
  const recipients = new Set(session.subscriptions.subscribers(partitionKey));
  const hash = eventId.indexOf('#');
  if (hash > 0) {
    const baseKey = partitionKey.replace(eventId, eventId.slice(0, hash));
    for (const sock of session.subscriptions.subscribers(baseKey)) recipients.add(sock);
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
async function foldAndDeliverAuthorityEvent(session: SyncSession, event: SyncEvent) {
  const shared = session.shared;
  const partitionKey = await resolvePartitionKey(session, event.id!);
  // The shared materialization buckets by partition key; each CLIENT
  // keeps its plain-id bucket (it only ever sees its own partition), so
  // the folded clone is re-keyed but delivered events are not.
  shared.serverState.dispatch(
    partitionKey === event.id ? event : { ...event, id: partitionKey });
  shared.persister.stateChanged(shared.serverState.state);

  const recipients = subscribersForPartition(session, event.id!, partitionKey);
  if (event.authority === 'server') {
    const bucket = (shared.serverState.state as any).component?.[partitionKey];
    if (bucket !== undefined) shared.broadcastStatePatch(event.id!, bucket, recipients);
  } else {
    shared.broadcastEvent(event, session.origin, recipients);
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
async function foldAndDeliverUserEvent(session: SyncSession, event: SyncEvent) {
  const own = session.own;
  // Capture the TRANSITION for distant folds: aggregation views consume
  // {prev, next} of the answered field, which is what makes them
  // one-user-one-count (aggregations.ts) — twelve rewrites are twelve
  // moves ending at one value, not twelve votes.
  const prev = event.id && event.field
    ? (own.serverState.state as any).component?.[event.id]?.[event.field]
    : undefined;
  own.serverState.dispatch(event);
  own.persister.stateChanged(own.serverState.state);
  own.broadcastEvent(event, session.origin);
  if (session.grouping && event.id && event.field) {
    const regrouped = await session.grouping.groupedBlocksFor(event.id, event.field);
    for (const blockId of regrouped) await switchGroup(session, blockId);
  }
  if (session.aggregations && event.id && event.field) {
    const next = (own.serverState.state as any).component?.[event.id]?.[event.field];
    if (next !== prev) {
      const views = await session.aggregations.viewsFor(event.id, event.field);
      for (const view of views) await applyAggregation(session, view, { prev, next });
    }
  }
}

/**
 * Apply one aggregation view's fold to a transition (aggregations.ts):
 * derived buckets live in the SHARED materialization under the view's
 * partition key (per-section distributions come free from grouping).
 * The base for an empty bucket is the view's seed attribute — prior-
 * semester data as content — else the spec's initial. This is the sync
 * engine's own maintenance write: it patches the materialization
 * directly rather than folding a synthetic event.
 */
async function applyAggregation(
  session: SyncSession,
  view: import('./aggregations').AggregationView,
  transition: { prev: unknown; next: unknown },
) {
  const shared = session.shared;
  const partitionKey = await resolvePartitionKey(session, view.viewId);
  const state = shared.serverState.state as any;
  const bucket = state.component?.[partitionKey] ?? {};
  let base = bucket[view.resultField];
  if (base === undefined && view.seed) {
    try { base = JSON.parse(view.seed); }
    catch { console.warn(`[aggregations] unparseable seed on ${view.viewId}`); }
  }
  const derived = view.spec.fold(
    base ?? view.spec.initial,
    { ...transition, user: session.principal },
  );

  shared.serverState.state = {
    ...state,
    component: {
      ...state.component,
      [partitionKey]: { ...bucket, [view.resultField]: derived },
    },
  };
  shared.persister.stateChanged(shared.serverState.state);

  const recipients = subscribersForPartition(session, view.viewId, partitionKey);
  const patched = (shared.serverState.state as any).component[partitionKey];
  shared.broadcastStatePatch(view.viewId, patched, recipients);
}

/**
 * A user's partition for `blockId` changed (they re-picked): move ALL
 * their connections' subscriptions to the new partition and push its
 * bucket so their UI switches content now, not at next reload. Fields
 * present in old partitions but absent in the new bucket are blanked —
 * otherwise the old group's text would linger on screen.
 */
async function switchGroup(session: SyncSession, blockId: string) {
  const newKey = await resolvePartitionKey(session, blockId);
  const sharedComponents = (session.shared.serverState.state as any).component ?? {};
  const blanks: Record<string, any> = {};
  for (const key of Object.keys(sharedComponents)) {
    if (key !== blockId && !key.startsWith(`${blockId}::`)) continue;
    for (const field of Object.keys(sharedComponents[key] ?? {})) blanks[field] = '';
  }
  const patch = { ...blanks, ...(sharedComponents[newKey] ?? {}) };
  const sockets = session.registry.socketsOf(session.principal);
  for (const sock of sockets) session.subscriptions.resubscribe(sock, blockId, newKey);
  if (Object.keys(patch).length > 0) {
    session.shared.broadcastStatePatch(blockId, patch, sockets);
  }
}
