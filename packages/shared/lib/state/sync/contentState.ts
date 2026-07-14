// packages/shared/lib/state/sync/contentState.ts
//
// The content-fetch half of the sync engine: fetching a page declares
// what the caller renders, so a content response carries their field
// state for exactly those blocks and their live connections subscribe to
// them (fields-design 2b, "the content fetch IS the subscription").
// The HTTP route is a passthrough to stateForContentFetch.

import type { SafeUserId } from '@/lib/types/identity';
import type { StateKey } from '@/lib/types/id-grammar';
import { leafDefinitionKeyFromStateKey, parseDefinitionKey } from '@/lib/types/id-grammar';
import type { UserStateRegistry } from './registry';
import type { SubscriptionRegistry } from './subscriptions';
import { parsePartitionSpec, groupFor } from './partitions';
import { ALL, type LevelInstance, userInstance, setInstance, subscriptionKey, isEphemeralNamespaceKey } from './levels';

/**
 * The picker state keys the served blocks' grouped-by specs read —
 * exactly what partition resolution needs from the caller's own state,
 * so instancesFor never needs the whole instance.
 */
function pickerKeysFor(responseIdMap: Record<string, any>): string[] {
  const keys: string[] = [];
  for (const id of Object.keys(responseIdMap)) {
    for (const variant of Object.values(responseIdMap[id] ?? {})) {
      const spec = (variant as any)?.attributes?.['grouped-by'];
      if (spec) {
        const parsed = parsePartitionSpec(spec, id);
        if (parsed) keys.push(parsed.pickerKey);
        break;
      }
    }
  }
  return keys;
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
    // Id-scoped read: shared buckets live under plain block ids, so this
    // is a direct batched lookup — never "assemble the whole `all`
    // instance to pick out a page's worth of buckets", which scaled with
    // total deployment state, not this page (found by review 2026-07).
    const buckets = await registry.readBuckets(instance, ids);
    for (const id of ids) {
      if (buckets[id] !== undefined) sharedComponent[id] = buckets[id];
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
/** What a state fetch answers, per requested key: the caller's own
 * bucket (`component`), the shared bucket at the key's level instance
 * (`sharedComponent`), or membership in `absent` — the explicit
 * "confirmed: no state" a loading block needs to stop waiting. Every
 * requested key appears in exactly one of the three... except a key
 * with BOTH own and shared state, which appears in both maps. */
export interface StateForKeys {
  component: Record<string, any>;
  sharedComponent: Record<string, any>;
  absent: StateKey[];
}

/**
 * The state-fetch half of the demand-driven loading path: a client that
 * knows exactly which state instances it renders (usually because an
 * ancestor's own state enumerates them — a dynamic list's items field
 * IS the index of its instances) asks for those keys and nothing else.
 * The complement of stateForContentFetch: that path bundles state for
 * definitions the content response serves; this one serves exact keys
 * the content response could not have named. Both are subscriptions.
 *
 * Reads are id-scoped end to end (readBuckets): a request costs
 * O(keys), never O(caller's course footprint) and never O(the `all`
 * instance). Grouped blocks resolve their partition through the leaf
 * definition's grouped-by spec, reading ONLY the picker buckets.
 */
export async function stateForKeys(
  registry: UserStateRegistry,
  subscriptions: SubscriptionRegistry,
  principal: SafeUserId,
  keys: StateKey[],
  idMap: Record<string, any>,
): Promise<StateForKeys> {
  const unique = [...new Set<StateKey>(keys)];
  const own = userInstance(principal);

  // Partition resolution, picker-scoped: collect the leaf definitions'
  // grouped-by specs, read just the picker buckets, and let instancesFor
  // apply its usual rule over an idMap slice keyed by those leaves.
  const leafOf = new Map<StateKey, string>(
    unique.map((key) => [key, leafDefinitionKeyFromStateKey(key) as string]));
  const idMapSlice: Record<string, any> = {};
  for (const leaf of leafOf.values()) {
    if (idMap[leaf] !== undefined) idMapSlice[leaf] = idMap[leaf];
  }
  const pickerKeys = pickerKeysFor(idMapSlice);
  const pickerScopes = pickerKeys.length > 0
    ? { component: await registry.readBuckets(own, pickerKeys) }
    : null;
  const instanceOfLeaf = instancesFor(idMapSlice, pickerScopes);

  // One id-scoped read per touched instance: the caller's own copy of
  // every key, plus each key's shared copy at its resolved instance.
  const instanceOf = new Map<StateKey, LevelInstance>(
    unique.map((key) => [key, instanceOfLeaf.get(leafOf.get(key)!) ?? ALL]));
  const byInstance = new Map<LevelInstance, StateKey[]>();
  for (const [key, instance] of instanceOf) {
    byInstance.set(instance, [...(byInstance.get(instance) ?? []), key]);
  }
  const component = await registry.readBuckets(own, unique);
  const sharedComponent: Record<string, any> = {};
  for (const [instance, instanceKeys] of byInstance) {
    const buckets = await registry.readBuckets(instance, instanceKeys);
    for (const key of instanceKeys) {
      if (buckets[key] !== undefined) sharedComponent[key] = buckets[key];
    }
  }

  // The state fetch IS a subscription, exactly like the content fetch:
  // live connections subscribe now; notePending covers the socket race.
  const subKeys = unique.map((key) => subscriptionKey(instanceOf.get(key)!, key));
  for (const connection of registry.socketsOf(own)) {
    subscriptions.subscribe(connection, subKeys);
  }
  subscriptions.notePending(principal, subKeys);

  const absent = unique.filter(
    (key) => component[key] === undefined && sharedComponent[key] === undefined);
  return { component, sharedComponent, absent };
}

export async function stateForContentFetch(
  registry: UserStateRegistry,
  subscriptions: SubscriptionRegistry,
  principal: SafeUserId,
  responseIdMap: Record<string, any>,
): Promise<Record<string, any> | null> {
  const own = userInstance(principal);

  // Ephemeral blocks (docs sandboxes) never ride a content fetch — even
  // state persisted before the ephemeral policy stays server-side only.
  const persistentIdMap = Object.fromEntries(
    Object.entries(responseIdMap).filter(
      ([id]) => !isEphemeralNamespaceKey(parseDefinitionKey(id)),
    ),
  );

  // The served DEFINITION ids ARE the caller's static state keys
  // (StateKey = DefinitionKey when no scope applies), so both partition
  // resolution and the own-state read are id-scoped constructions —
  // never "assemble the caller's whole instance and filter", which
  // scaled with their course footprint, guessed key membership by
  // prefix, and spoke a dead '#'-suffix grammar (found by review
  // 2026-07). Scoped instances (ns/list:#2:answer) deliberately do NOT
  // ride content responses: only an ancestor's own state enumerates
  // them, so the client requests them exactly (stateForKeys) after it
  // renders that ancestor.
  const servedIds = Object.keys(persistentIdMap);
  const pickerKeys = pickerKeysFor(persistentIdMap);
  const pickerScopes = pickerKeys.length > 0
    ? { component: await registry.readBuckets(own, pickerKeys) }
    : null;
  const instanceOf = instancesFor(persistentIdMap, pickerScopes);

  const keys = [...instanceOf].map(([id, instance]) => subscriptionKey(instance, id));
  for (const connection of registry.socketsOf(own)) {
    subscriptions.subscribe(connection, keys);
  }
  // The fetch may have raced the caller's WebSocket (page load fetches
  // content before the socket opens): record the keys against the
  // principal so the arriving connection adopts them (subscriptions.ts).
  subscriptions.notePending(principal, keys);

  const component = await registry.readBuckets(own, servedIds);
  const shared = await sharedStateFor(registry, instanceOf);
  if (Object.keys(component).length === 0 && Object.keys(shared).length === 0) return null;
  return {
    ...(Object.keys(component).length > 0 ? { component } : {}),
    ...(Object.keys(shared).length > 0 ? { sharedComponent: shared } : {}),
  };
}
