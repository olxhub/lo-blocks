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
import type { StateKey } from '@/lib/types';
import type { StateConnection } from './connection';
import type { UserStateRegistry, UserStateEntry } from './registry';
import type { SubscriptionRegistry } from './subscriptions';
import type { GroupingIndex } from './partitions';
import type { SharedFieldPolicyIndex, SharedFieldPolicy } from './fieldLevels';
import type { AggregationIndex, AggregationView } from './aggregations';
import { parsePartitionSpec, groupFor } from './partitions';
import {
  tryParseStateKey, leafDefinitionIdFor, leafDefinitionKeyFromStateKey,
} from '@/lib/types/id-grammar';
import { assembleFieldState } from './persistence';
import type { KVStore } from '@/lib/storage/kvs';
import {
  ALL, type LevelInstance, userInstance, isUserInstance, setInstance, subscriptionKey,
  isEphemeralNamespaceKey, indexScopeByLeafDefinition,
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
  /** Trusted level declarations from content + registry; absent = every
   * field is level 'user'. Routing NEVER trusts the wire's authority
   * stamp — see resolveLevel. */
  fieldLevels?: SharedFieldPolicyIndex;
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
  id?: StateKey;
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

/** The event's field level, from TRUSTED declarations only. The wire's
 * authority stamp is self-description for the event log, not an input
 * to routing — a client stamping 'shared' on a private field must not
 * reach shared state. Undefined = level 'user' (fail closed: no index,
 * no declaration, or no field name on the event → private). */
async function resolveLevel(session: SyncSession, event: SyncEvent): Promise<SharedFieldPolicy | undefined> {
  const info = session.fieldLevels && event.id && event.field
    ? await session.fieldLevels.sharedPolicyFor(event.id, event.field)
    : undefined;
  if (event.authority && !info) {
    // Forged stamp, stale client, or content/registry skew — routed as
    // level 'user' either way; log so skew is visible.
    console.warn(`[sync] wire claims authority '${event.authority}' on `
      + `${event.id}.${event.field} but content declares level user — routing as user`);
  }
  return info;
}

/** The instance a level-everyone block folds into for THIS sender:
 * their partition when grouped, else `all`. The partition NEVER comes
 * from the wire: grouped fields resolve from the SENDER's own state.
 * Grouping is declared on DEFINITIONS, so a scoped instance
 * (`ns/list:#2:notes`) resolves via its leaf definition. `stateId` is
 * the event's runtime state id (usually a StateKey; parsed inside). */
async function sharedInstanceFor(session: SyncSession, stateId: string): Promise<LevelInstance> {
  const defId = leafDefinitionIdFor(stateId);
  const spec = session.grouping
    ? await session.grouping.specOf(defId) : undefined;
  if (!spec) return ALL;
  // The spec's contract is "the grouped block's id" — pass the definition,
  // not the scoped state id. (Passing stateId happened to work only because
  // the grammar forbids '/' in the path portion, so slicing to the namespace
  // gave the same answer — an equivalence the callee never promised.)
  const parsed = parsePartitionSpec(spec, defId);
  const own = session.holdings.get(userInstance(session.principal));
  const group = parsed && own
    ? groupFor(own.serverState.state as any, parsed)
    : undefined;
  return group !== undefined ? setInstance(spec, group) : ALL;
}

/**
 * Who hears about an event at an instance: the connections subscribed to
 * (instance, stateId) — content fetch = subscription; writers
 * self-subscribe so a client that writes without fetching still hears
 * responses. A scoped state key (`ns/list:#2:grader`) also reaches the
 * subscribers of its LEAF DEFINITION, because nobody subscribes a scoped
 * id: a content fetch names definitions, so whoever renders the list
 * subscribed `ns/grader` (the list's static kid) at the instance their
 * own partition resolved to — the same instance this event routed to.
 * (This used to slice at '#', a pre-id-grammar dialect nothing produces;
 * scoped events reached only exact-key subscribers, i.e. usually nobody.
 * Found by review 2026-07.)
 *
 * The leaf SUFFICES, and the container hop this used to add
 * (allDefinitionKeysFromStateKey) leaked across partitions: every reader
 * of an ungrouped container holds it at `all` (instancesFor), so an
 * unpartitioned scoped write fanned into every partition's readers at
 * once. Only the leaf's subscription key carries a per-subscriber
 * resolved instance; container keys pin `all` and cannot filter.
 * (Found by review 2026-08.)
 */
function subscribersFor(
  session: SyncSession,
  instance: LevelInstance,
  stateId: string,
): Set<StateConnection> {
  session.subscriptions.subscribe(session.origin, [subscriptionKey(instance, stateId)]);
  const recipients = new Set(session.subscriptions.subscribers(subscriptionKey(instance, stateId)));
  // An id that isn't a StateKey has no leaf definition — exact-key
  // subscribers (above) are the only audience.
  const key = tryParseStateKey(stateId);
  const leafDef = key ? leafDefinitionKeyFromStateKey(key) : undefined;
  if (leafDef !== undefined && leafDef !== stateId) {
    for (const sock of session.subscriptions.subscribers(subscriptionKey(instance, leafDef))) {
      recipients.add(sock);
    }
  }
  return recipients;
}

/**
 * Fold one event and deliver it. This is the whole reducer stage.
 */
export async function routeEvent(session: SyncSession, event: SyncEvent): Promise<void> {
  // Ephemeral namespaces (docs demo sandboxes): never folded or persisted —
  // the client's optimistic local fold is the only copy, gone on refresh.
  if (event.id && isEphemeralNamespaceKey(event.id)) return;

  const level = await resolveLevel(session, event);
  const instance = level
    ? await sharedInstanceFor(session, event.id!)
    : userInstance(session.principal);
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
    // applied the event optimistically, and the field folds are all
    // idempotent, so a sibling that also hears it over BroadcastChannel
    // converges rather than doubling).
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
  } else if (level!.delivery === 'folded') {
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
 * — otherwise the old group's text would linger on screen.
 *
 * Nothing is scanned to FIND the partitions: the picker transition names
 * both of them directly. Within those two (already materialized)
 * partitions we do index the buckets in hand, because `blockId` is a
 * DEFINITION and a grouped block may have many scoped INSTANCES
 * (`demos/list:#2:chat`) that only the container's state knows about.
 * Patching just the plain id left every scoped copy showing the old
 * group's content; indexScopeByLeafDefinition (levels.ts) picks them out
 * of the scopes already read here — no extra I/O, no reverse index.
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
  const newComponent = (newEntry.serverState.state as any).component as
    Record<string, any> | undefined;
  const oldScopes = await session.registry.read(oldInstance);
  const oldComponent = oldScopes?.component as Record<string, any> | undefined;

  // Every state id of this definition in either partition — the plain
  // definition bucket plus any scoped instances (see the note above).
  // One index per partition scope, not one filter per lookup: the two
  // scopes are walked once each, then asked about `blockId`.
  const stateIds = new Set([
    ...(indexScopeByLeafDefinition(newComponent).get(blockId) ?? []),
    ...(indexScopeByLeafDefinition(oldComponent).get(blockId) ?? []),
  ]);
  // Every one of these becomes its own broadcastStatePatch, so a
  // definition with N accumulated scoped instances costs N messages per
  // re-pick. Not bounded here: the only available narrowing is "does this
  // user still subscribe the state id's CONTAINER", and container
  // subscriptions are held at `all` by every reader (instancesFor), so
  // asking would drop legitimate patches for any container that IS
  // grouped — a stale-UI bug traded for a message count. Demand loading
  // (TODO(demand-loading), levels.ts) removes the accumulation instead.

  // Which of this socket's keys belong to `blockId`? A subscription key is
  // `{instance}|{stateId}`, and only the stateId is '|'-free (instances can
  // carry a JSON-stringified group member) — hence lastIndexOf, not split.
  // We compare the state id's LEAF DEFINITION: grouping is declared on
  // definitions, so every scoped copy (`demos/list:#2:chat`) belongs to the
  // same partition as its definition (`demos/chat`) — scope segments only
  // pick which copy. A bare DefinitionKey is a StateKey whose leaf is
  // itself, so this also matches the plain definition subscription.
  // Bug memory: matching keys by `endsWith('|' + blockId)` left a writer's
  // stale SCOPED self-subscription alive in the OLD partition, so a switched
  // user kept receiving that partition's scoped events (found by review
  // 2026-08; regression test in apps/server/src/pipeline.test.ts).
  const belongsToBlock = (key: string) =>
    leafDefinitionIdFor(key.slice(key.lastIndexOf('|') + 1)) === blockId;

  const sockets = session.registry.socketsOf(userInstance(session.principal));
  for (const sock of sockets) {
    session.subscriptions.resubscribe(sock, belongsToBlock, subscriptionKey(newInstance, blockId));
  }
  for (const stateId of stateIds) {
    const newBucket = newComponent?.[stateId] ?? {};
    const blanks: Record<string, any> = {};
    for (const field of Object.keys(oldComponent?.[stateId] ?? {})) blanks[field] = '';
    const patch = { ...blanks, ...newBucket };
    if (Object.keys(patch).length > 0) {
      newEntry.broadcastStatePatch(stateId, patch, sockets);
    }
  }
}

/**
 * Apply one aggregation view's fold to a transition (aggregations.ts):
 * derived buckets live at the view's instance (its partition — per-
 * section distributions come free). The base for an empty bucket is the
 * view's seed attribute, else the spec's initial. This is the sync
 * engine's own maintenance write: it patches the materialization
 * directly rather than folding a synthetic event, and it trusts itself —
 * derived fields are level everyone by construction, no lookup needed.
 */
async function applyAggregation(
  session: SyncSession,
  view: AggregationView,
  transition: { prev: unknown; next: unknown },
) {
  const instance = await sharedInstanceFor(session, view.viewId);
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
