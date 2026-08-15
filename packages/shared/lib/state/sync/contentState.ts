// packages/shared/lib/state/sync/contentState.ts
//
// The content-fetch half of the sync engine: fetching a page declares
// what the caller renders, so a content response carries their field
// state for exactly those blocks and their live connections subscribe to
// them (fields-design 2b, "the content fetch IS the subscription").
// The HTTP route is a passthrough to stateForContentFetch.

import type { SafeUserId } from '@/lib/types/identity';
import {
  parseDefinitionKey, tryParseStateKey, allDefinitionKeysFromStateKey,
} from '@/lib/types/id-grammar';
import type { UserStateRegistry } from './registry';
import type { SubscriptionRegistry } from './subscriptions';
import { parsePartitionSpec, groupFor } from './partitions';
import {
  ALL, type LevelInstance, userInstance, setInstance, subscriptionKey,
  isEphemeralNamespaceKey, indexScopeByLeafDefinition,
} from './levels';

/**
 * The state ids of ONE served definition that this fetch may carry, from
 * a scope already indexed by leaf definition (levels.ts).
 *
 * A served id is a DEFINITION id (a content fetch names definitions) but
 * state is stored per INSTANCE, so `demos/chat` also answers for every
 * scoped copy `demos/list:#2:chat` — that is the index's bucket.
 *
 * Bounded by the CHAIN, though: a scoped id rides only when every
 * definition along it (container(s) + leaf) is served by this same fetch.
 * Scopes are per instance, and the `all` instance is deployment-global —
 * without the bound, fetching one page that happens to contain `chat`
 * would ship the chat buckets of every OTHER page's list. Bare keys
 * (chain = [self]) are unaffected: self is served by construction.
 */
function servedStateIdsOf(
  index: Map<string, string[]>,
  id: string,
  servedIds: ReadonlySet<string>,
): string[] {
  return (index.get(id) ?? []).filter((stateId) => {
    // A non-StateKey id (setting tag, storage URI) has no chain — it is
    // in this bucket only by exact equality with the served id.
    const key = tryParseStateKey(stateId);
    return !key || allDefinitionKeysFromStateKey(key).every(d => servedIds.has(d));
  });
}

/**
 * Pick the caller's PER-USER component buckets that belong to the ids
 * being served — the same definition→instances logic as sharedStateFor
 * (see servedStateIdsOf), over the caller's own scope.
 *
 * This used to match `{id}#{qualifier}` prefixes, a pre-id-grammar
 * dialect nothing produces: real scoped keys (`demos/list:#2:notes`)
 * matched nothing, so a user's own scoped answers never rode a content
 * fetch — and since the client adopts server state only where it has none
 * locally, and the fetch is the only channel carrying it, a reload lost
 * them from the screen (found by review 2026-08).
 */
export function fieldStateForIds(
  scopes: Record<string, any> | null,
  ids: string[],
): Record<string, any> | null {
  if (!scopes?.component) return null;
  const index = indexScopeByLeafDefinition(scopes.component);
  const servedIds = new Set(ids);
  const component: Record<string, any> = {};
  for (const id of ids) {
    for (const stateId of servedStateIdsOf(index, id, servedIds)) {
      component[stateId] = scopes.component[stateId];
    }
  }
  return Object.keys(component).length > 0 ? { component } : null;
}

/**
 * For each served block, the LEVEL INSTANCE its shared state lives in:
 * grouped blocks (grouped-by attribute) partition by THIS caller's own
 * state (partitions.ts); everything else lives at `all`.
 */
export function instancesFor(
  responseIdMap: Record<string, any>,
  callerScopes: Record<string, any> | null,
): Map<string, LevelInstance> {
  const instanceOf = new Map<string, LevelInstance>();
  for (const id of Object.keys(responseIdMap)) {
    let instance: LevelInstance = ALL;
    for (const variant of Object.values(responseIdMap[id] ?? {})) {
      const spec = (variant as any)?.attributes?.['grouped-by'];
      if (spec) {
        const parsed = parsePartitionSpec(spec, id);
        const group = parsed ? groupFor(callerScopes, parsed) : undefined;
        if (group !== undefined) instance = setInstance(spec, group);
        break;
      }
    }
    instanceOf.set(id, instance);
  }
  return instanceOf;
}

/**
 * The caller's shared buckets for the served blocks — read from each
 * block's level instance under their OWN state ids (clients are
 * partition-oblivious; the address carries the partition).
 *
 * A served id is a DEFINITION id (a content fetch names definitions), but
 * shared state is stored per INSTANCE: a list's scoped copies live at
 * `ns/list:#2:chat` alongside the plain `ns/chat`. Picking only the exact
 * id dropped every scoped bucket, so a rejoining client saw an empty
 * shared list. The instance's scope is already read here, so each served
 * id contributes the buckets whose LEAF DEFINITION is that id, keyed by
 * their own state ids — the plain definition bucket is the special case
 * where the key is the id itself.
 *
 * One index per instance read (levels.ts) answers for every served id at
 * that instance: one key parse per bucket instead of one per bucket per
 * served id. The chain bound in servedStateIdsOf keeps the blast radius
 * to the containers this page actually renders. Both are transitional —
 * see TODO(demand-loading) in levels.ts.
 */
async function sharedStateFor(
  registry: UserStateRegistry,
  instanceOf: Map<string, LevelInstance>,
): Promise<Record<string, any>> {
  const byInstance = new Map<LevelInstance, string[]>();
  for (const [id, instance] of instanceOf) {
    byInstance.set(instance, [...(byInstance.get(instance) ?? []), id]);
  }
  // The bound spans the WHOLE fetch, not one instance: a grouped leaf sits
  // in the caller's partition while its (ungrouped) container sits at
  // `all`, and both are served by this response.
  const servedIds = new Set(instanceOf.keys());
  const sharedComponent: Record<string, any> = {};
  for (const [instance, ids] of byInstance) {
    const scopes = await registry.read(instance);
    const index = indexScopeByLeafDefinition(scopes?.component);
    for (const id of ids) {
      for (const stateId of servedStateIdsOf(index, id, servedIds)) {
        const bucket = scopes!.component[stateId];
        if (bucket !== undefined) sharedComponent[stateId] = bucket;
      }
    }
  }
  return sharedComponent;
}

/**
 * Everything a content response needs from the sync engine: resolve the
 * caller's partitions for the served blocks, subscribe their live
 * connections, and return the fieldState payload — per-user buckets
 * under `component` (client adopts only when locally absent) and shared
 * buckets under `sharedComponent` (server-authoritative, field-level
 * merge; see ADOPT_FIELD_STATE in store.ts). Returns null when the
 * caller has no state for these blocks — normal for new users and new
 * content; the response key is simply omitted.
 */
export async function stateForContentFetch(
  registry: UserStateRegistry,
  subscriptions: SubscriptionRegistry,
  principal: SafeUserId,
  responseIdMap: Record<string, any>,
): Promise<Record<string, any> | null> {
  const callerScopes = await registry.read(userInstance(principal));
  // Ephemeral blocks (docs sandboxes) never ride a content fetch — even
  // state persisted before the ephemeral policy stays server-side only.
  const persistentIdMap = Object.fromEntries(
    Object.entries(responseIdMap).filter(
      ([id]) => !isEphemeralNamespaceKey(parseDefinitionKey(id)),
    ),
  );
  const instanceOf = instancesFor(persistentIdMap, callerScopes);

  const keys = [...instanceOf].map(([id, instance]) => subscriptionKey(instance, id));
  for (const connection of registry.socketsOf(userInstance(principal))) {
    subscriptions.subscribe(connection, keys);
  }
  // The fetch may have raced the caller's WebSocket (page load fetches
  // content before the socket opens): record the keys against the
  // principal so the arriving connection adopts them (subscriptions.ts).
  subscriptions.notePending(principal, keys);

  const own = fieldStateForIds(callerScopes, [...instanceOf.keys()]);
  const shared = await sharedStateFor(registry, instanceOf);
  if (!own && Object.keys(shared).length === 0) return null;
  return {
    ...(own ? { component: own.component } : {}),
    ...(Object.keys(shared).length > 0 ? { sharedComponent: shared } : {}),
  };
}
