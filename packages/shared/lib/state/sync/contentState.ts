// packages/shared/lib/state/sync/contentState.ts
//
// The content-fetch half of the sync engine: fetching a page declares
// what the caller renders, so a content response carries their field
// state for exactly those blocks and their live connections subscribe to
// them (fields-design 2b, "the content fetch IS the subscription").
// The HTTP route is a passthrough to stateForContentFetch.

import type { SafeUserId } from '@/lib/types/identity';
import type { UserStateRegistry } from './registry';
import { SHARED_STATE_ID } from './registry';
import type { SubscriptionRegistry } from './subscriptions';
import { parsePartitionSpec, groupFor, partitionedId } from './partitions';

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
 * For each served block, the key its shared state lives under: grouped
 * blocks (grouped-by attribute) partition by THIS caller's own state
 * (partitions.ts); everything else keys by plain id.
 */
export function partitionKeysFor(
  responseIdMap: Record<string, any>,
  callerScopes: Record<string, any> | null,
): Map<string, string> {
  const keyOf = new Map<string, string>();
  for (const id of Object.keys(responseIdMap)) {
    let key = id;
    for (const variant of Object.values(responseIdMap[id] ?? {})) {
      const spec = (variant as any)?.attributes?.['grouped-by'];
      if (spec) {
        const parsed = parsePartitionSpec(spec, id);
        const group = parsed ? groupFor(callerScopes, parsed) : undefined;
        if (group !== undefined) key = partitionedId(id, group);
        break;
      }
    }
    keyOf.set(id, key);
  }
  return keyOf;
}

/**
 * The caller's shared buckets for the served blocks, mapped back to the
 * plain block id (clients are partition-oblivious).
 */
function sharedStateFor(
  sharedScopes: Record<string, any> | null,
  keyOf: Map<string, string>,
): Record<string, any> {
  const sharedComponent: Record<string, any> = {};
  for (const [id, key] of keyOf) {
    const bucket = sharedScopes?.component?.[key];
    if (bucket !== undefined) sharedComponent[id] = bucket;
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
  const callerScopes = await registry.read(principal);
  const keyOf = partitionKeysFor(responseIdMap, callerScopes);

  const keys = [...keyOf.values()];
  for (const connection of registry.socketsOf(principal)) {
    subscriptions.subscribe(connection, keys);
  }
  // The fetch may have raced the caller's WebSocket (page load fetches
  // content before the socket opens): record the keys against the
  // principal so the arriving connection adopts them (subscriptions.ts).
  subscriptions.notePending(principal, keys);

  const own = fieldStateForIds(callerScopes, [...keyOf.keys()]);
  const shared = sharedStateFor(await registry.read(SHARED_STATE_ID), keyOf);
  if (!own && Object.keys(shared).length === 0) return null;
  return {
    ...(own ? { component: own.component } : {}),
    ...(Object.keys(shared).length > 0 ? { sharedComponent: shared } : {}),
  };
}
