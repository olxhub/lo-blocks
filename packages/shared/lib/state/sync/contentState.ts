// packages/shared/lib/state/sync/contentState.ts
//
// The content-fetch half of the sync engine: fetching a page declares
// what the caller renders, so a content response carries their field
// state for exactly those blocks and their live connections subscribe to
// them (fields-design 2b, "the content fetch IS the subscription").
// The HTTP route is a passthrough to stateForContentFetch.

import type { SafeUserId } from '@/lib/types/identity';
import type { UserStateRegistry } from './registry';
import type { SubscriptionRegistry } from './subscriptions';
import { parsePartitionSpec, groupFor } from './partitions';
import { ALL, type LevelInstance, userInstance, setInstance, subscriptionKey, isEphemeralBlockId } from './levels';

/**
 * Pick the caller's per-user component buckets that belong to the ids
 * being served. State keys usually equal block ids; scoped variants
 * extend the id (`{id}#{qualifier}`), so prefix matches are included.
 */
export function fieldStateForIds(
  scopes: Record<string, any> | null,
  ids: string[],
): Record<string, any> | null {
  if (!scopes?.component) return null;
  const component: Record<string, any> = {};
  for (const key of Object.keys(scopes.component)) {
    if (ids.some((id) => key === id || key.startsWith(`${id}#`))) {
      component[key] = scopes.component[key];
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
 * block's level instance under its PLAIN id (clients are partition-
 * oblivious; the address carries the partition).
 */
async function sharedStateFor(
  registry: UserStateRegistry,
  instanceOf: Map<string, LevelInstance>,
): Promise<Record<string, any>> {
  const byInstance = new Map<LevelInstance, string[]>();
  for (const [id, instance] of instanceOf) {
    byInstance.set(instance, [...(byInstance.get(instance) ?? []), id]);
  }
  const sharedComponent: Record<string, any> = {};
  for (const [instance, ids] of byInstance) {
    const scopes = await registry.read(instance);
    for (const id of ids) {
      const bucket = scopes?.component?.[id];
      if (bucket !== undefined) sharedComponent[id] = bucket;
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
    Object.entries(responseIdMap).filter(([id]) => !isEphemeralBlockId(id)),
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
