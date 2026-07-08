// packages/shared/lib/state/sync/router.ts
//
// The sync engine's event entry point — ONE rule (docs/state-library-
// design.md §5b): resolve which LEVEL INSTANCE an event belongs to, fold
// it into that instance's materialization under its PLAIN bucket id, and
// deliver to the instance's subscribers (a user instance's devices are
// its implicit subscribers). Per-user vs shared vs grouped is not a
// branch — it is which instance the address names:
//
//   user:<id>            level 'user' (default) — the sender's own copy
//   set:<name>:<member>  grouped fields — the sender's partition,
//                        resolved from THEIR OWN state, never the wire
//   all                  level 'everyone'
//
// Delivery per the field's declaration: events relay (recipients fold
// them — the origin already did, optimistically), or, for folded
// delivery, only the reduced bucket leaves the server.

import type { SafeUserId } from '@/lib/types/identity';
import type { StateConnection } from './connection';
import type { UserStateRegistry, UserStateEntry } from './registry';
import type { SubscriptionRegistry } from './subscriptions';
import type { GroupingIndex } from './partitions';
import type { AggregationIndex, AggregationView } from './aggregations';
import { parsePartitionSpec, groupFor } from './partitions';
import { assembleFieldState } from './persistence';
import type { KVStore } from '@/lib/storage/kvs';
import {
  ALL, type LevelInstance, userInstance, isUserInstance, setInstance, subscriptionKey,
} from './levels';

/** One connection's standing context in the sync engine — acquired at
 * connect, released (ALL holdings) in the pipeline's finally. */
export interface SyncSession {
  /** Where events from this session originate (their sender). */
  origin: StateConnection;
  /** The sender's user id (their own instance is user:<principal>). */
  principal: SafeUserId;
  registry: UserStateRegistry;
  subscriptions: SubscriptionRegistry;
  kvs: KVStore;
  /** Partition index from content; absent = no grouping. */
  grouping?: GroupingIndex;
  /** Aggregation index from content; absent = no distant folds. */
  aggregations?: AggregationIndex;
  /** Instances this session has acquired (own + all at connect; set
   * instances lazily). The pipeline releases every holding on close. */
  holdings: Map<LevelInstance, UserStateEntry>;
}

/** A field event as it arrives on the wire. */
export interface SyncEvent {
  event?: string;
  id?: string;
  field?: string;
  authority?: 'shared' | 'server';
  [key: string]: any;
}

/** The session's handle on an instance — acquired and seeded on first
 * use, held (and refcounted) until the connection closes. */
export async function entryFor(session: SyncSession, instance: LevelInstance): Promise<UserStateEntry> {
  const held = session.holdings.get(instance);
  if (held) return held;
  const entry = session.registry.acquire(instance, session.origin);
  session.holdings.set(instance, entry);
  await entry.ensureSeeded(async () => {
    const scopes = await assembleFieldState(session.kvs, instance);
    if (scopes) {
      entry.serverState.seed(scopes);
      entry.persister.startFromPersisted(entry.serverState.state);
    }
  });
  return entry;
}

/** Which instance an event's state lives in. The partition NEVER comes
 * from the wire: grouped fields resolve from the SENDER's own state. */
async function resolveInstance(session: SyncSession, event: SyncEvent): Promise<LevelInstance> {
  if (!event.authority) return userInstance(session.principal);
  const spec = session.grouping && event.id
    ? await session.grouping.specOf(event.id) : undefined;
  if (!spec) return ALL;
  const parsed = parsePartitionSpec(spec, event.id!);
  const own = session.holdings.get(userInstance(session.principal));
  const group = parsed && own
    ? groupFor(own.serverState.state as any, parsed)
    : undefined;
  return group !== undefined ? setInstance(spec, group) : ALL;
}

/**
 * Who hears about an event at an instance: the connections subscribed to
 * (instance, blockId) — content fetch = subscription; writers
 * self-subscribe so a client that writes without fetching still hears
 * responses. Scoped state keys (`defId#anchor`) also reach BASE-id
 * subscribers (content fetches subscribe by definition id).
 */
function subscribersFor(
  session: SyncSession,
  instance: LevelInstance,
  blockId: string,
): Set<StateConnection> {
  session.subscriptions.subscribe(session.origin, [subscriptionKey(instance, blockId)]);
  const recipients = new Set(session.subscriptions.subscribers(subscriptionKey(instance, blockId)));
  const hash = blockId.indexOf('#');
  if (hash > 0) {
    const base = subscriptionKey(instance, blockId.slice(0, hash));
    for (const sock of session.subscriptions.subscribers(base)) recipients.add(sock);
  }
  return recipients;
}

/**
 * Fold one event and deliver it. This is the whole reducer stage.
 */
export async function routeEvent(session: SyncSession, event: SyncEvent): Promise<void> {
  const instance = await resolveInstance(session, event);
  const entry = await entryFor(session, instance);
  const ownInstance = isUserInstance(instance);

  // Capture the TRANSITION for distant folds (aggregations.ts): views
  // consume {prev, next} of the answered field — one user, one count.
  const prev = ownInstance && event.id && event.field
    ? (entry.serverState.state as any).component?.[event.id]?.[event.field]
    : undefined;

  // Fold under the PLAIN bucket id — partitioning lives in the instance
  // address, never in the bucket key.
  entry.serverState.dispatch(event);
  entry.persister.stateChanged(entry.serverState.state);

  if (ownInstance) {
    // A user instance's devices are its implicit subscribers: relay to
    // the sender's other tabs/devices (origin excluded — it already
    // applied the event optimistically; requires tab-sync off, or
    // siblings would double-apply RGA splices).
    entry.broadcastEvent(event, session.origin);
    if (session.grouping && event.id && event.field) {
      const regrouped = await session.grouping.groupedBlocksFor(event.id, event.field);
      const next = (entry.serverState.state as any).component?.[event.id]?.[event.field];
      for (const blockId of regrouped) await switchGroup(session, blockId, prev, next);
    }
    if (session.aggregations && event.id && event.field) {
      const next = (entry.serverState.state as any).component?.[event.id]?.[event.field];
      if (next !== prev) {
        const views = await session.aggregations.viewsFor(event.id, event.field);
        for (const view of views) await applyAggregation(session, view, { prev, next });
      }
    }
  } else if (event.authority === 'server') {
    // Folded delivery: raw contributions are private; subscribers
    // (origin included — its optimistic local fold gets replaced)
    // receive the authoritative reduced bucket.
    const bucket = (entry.serverState.state as any).component?.[event.id!];
    const recipients = subscribersFor(session, instance, event.id!);
    if (bucket !== undefined) entry.broadcastStatePatch(event.id!, bucket, recipients);
  } else {
    const recipients = subscribersFor(session, instance, event.id!);
    entry.broadcastEvent(event, session.origin, recipients);
  }
}

/**
 * A user's partition for `blockId` changed (they re-picked): move ALL
 * their connections' subscriptions to the new instance and push its
 * bucket so their UI switches content now, not at next reload. Fields
 * present in the OLD partition but absent in the new bucket are blanked
 * — otherwise the old group's text would linger on screen. The picker
 * transition tells us both partitions; no scanning.
 */
async function switchGroup(
  session: SyncSession,
  blockId: string,
  prevPick: unknown,
  nextPick: unknown,
) {
  const spec = session.grouping ? await session.grouping.specOf(blockId) : undefined;
  if (!spec) return;
  const toMember = (v: unknown) =>
    v === undefined || v === null || v === ''
      ? undefined
      : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  const oldMember = toMember(prevPick);
  const newMember = toMember(nextPick);
  const oldInstance = oldMember !== undefined ? setInstance(spec, oldMember) : ALL;
  const newInstance = newMember !== undefined ? setInstance(spec, newMember) : ALL;
  if (oldInstance === newInstance) return;

  const newEntry = await entryFor(session, newInstance);
  const newBucket = (newEntry.serverState.state as any).component?.[blockId] ?? {};
  const oldScopes = await session.registry.read(oldInstance);
  const blanks: Record<string, any> = {};
  for (const field of Object.keys(oldScopes?.component?.[blockId] ?? {})) blanks[field] = '';
  const patch = { ...blanks, ...newBucket };

  const sockets = session.registry.socketsOf(userInstance(session.principal));
  for (const sock of sockets) {
    session.subscriptions.resubscribe(sock, blockId, subscriptionKey(newInstance, blockId));
  }
  if (Object.keys(patch).length > 0) {
    newEntry.broadcastStatePatch(blockId, patch, sockets);
  }
}

/**
 * Apply one aggregation view's fold to a transition (aggregations.ts):
 * derived buckets live at the view's instance (its partition — per-
 * section distributions come free). The base for an empty bucket is the
 * view's seed attribute, else the spec's initial. This is the sync
 * engine's own maintenance write: it patches the materialization
 * directly rather than folding a synthetic event.
 */
async function applyAggregation(
  session: SyncSession,
  view: AggregationView,
  transition: { prev: unknown; next: unknown },
) {
  const instance = await resolveInstance(session, { authority: 'server', id: view.viewId });
  const entry = await entryFor(session, instance);
  const state = entry.serverState.state as any;
  const bucket = state.component?.[view.viewId] ?? {};
  let base = bucket[view.resultField];
  if (base === undefined && view.seed) {
    try { base = JSON.parse(view.seed); }
    catch { console.warn(`[aggregations] unparseable seed on ${view.viewId}`); }
  }
  const derived = view.spec.fold(
    base ?? view.spec.initial,
    { ...transition, user: session.principal },
  );

  entry.serverState.state = {
    ...state,
    component: {
      ...state.component,
      [view.viewId]: { ...bucket, [view.resultField]: derived },
    },
  };
  entry.persister.stateChanged(entry.serverState.state);

  const recipients = subscribersFor(session, instance, view.viewId);
  const patched = (entry.serverState.state as any).component[view.viewId];
  entry.broadcastStatePatch(view.viewId, patched, recipients);
}
