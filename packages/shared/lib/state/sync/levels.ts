// packages/shared/lib/state/sync/levels.ts
//
// LEVEL INSTANCES — the first segment of every stored state address
// (docs/state-library-design.md §5b). A field's LEVEL says how many
// copies of its data exist; a level INSTANCE names one copy:
//
//   user:<safeUserId>          level 'user' (the default) — one per user
//   set:<setName>:<member>     named-set levels — one per group/team/
//                              section (setName identifies the partition
//                              function, member the partition)
//   all                        level 'everyone' — one, total
//
// Everything keys off these: materializations (one per instance),
// persistence (field:{instance}:{scope}:{bucket}), subscriptions
// ({instance}|{blockId}). Bucket keys stay PLAIN block ids at every
// level — partitioning lives in the address, never in the bucket key.

import type { SafeUserId } from '@/lib/types/identity';
import type { DefinitionKey, StateKey } from '@/lib/types';
import { leafDefinitionIdFor } from '@/lib/types/id-grammar';

/** An instance address segment. Deliberately a string (it IS a key). */
export type LevelInstance = string;

/** The single 'everyone' instance. */
export const ALL: LevelInstance = 'all';

const enc = encodeURIComponent;

export function userInstance(user: SafeUserId): LevelInstance {
  return `user:${user}`;
}

/** A named-set instance. Both parts are percent-encoded: set names are
 * derived from content refs (may contain '/', '.') and members from
 * user state values (arbitrary). */
export function setInstance(setName: string, member: string): LevelInstance {
  return `set:${enc(setName)}:${enc(member)}`;
}

/** Is this instance a specific user's? (Their devices are its implicit
 * subscribers; shared/set instances deliver by subscription instead.) */
export function isUserInstance(instance: LevelInstance): boolean {
  return instance.startsWith('user:');
}

/** Subscription key for a block within an instance. */
export function subscriptionKey(instance: LevelInstance, blockId: string): string {
  return `${instance}|${blockId}`;
}

/**
 * A MATERIALIZED component scope, indexed by the DEFINITION its state ids
 * belong to: `definitionId → [state ids]`.
 *
 * This is the ONE place answering "which state ids belong to this
 * definition?". It exists because scoped instances cannot be enumerated
 * from content: only a container's own state knows that
 * `demos/list:#2:chat` exists at all, so a consumer that already holds a
 * materialized scope answers from the keys it has in hand — no reverse
 * index in the KVS, no enumeration, no extra I/O.
 *
 *   indexScopeByLeafDefinition({ 'demos/chat': {}, 'demos/list:#2:chat': {} })
 *   → Map { 'demos/chat' → ['demos/chat', 'demos/list:#2:chat'] }
 *
 * Grouping is by LEAF DEFINITION (leafDefinitionIdFor): scope segments
 * only pick WHICH copy, so every scoped copy belongs to its definition,
 * and a bare DefinitionKey is a StateKey whose leaf is itself — the
 * exact-id case falls out as a special case. Ids that are not StateKeys
 * (componentSetting tags, storage URIs, system ids) index as themselves,
 * so they are found only by their exact id.
 *
 * An INDEX rather than a per-definition filter: callers ask about many
 * ids against one scope (a content fetch serves a whole page; a group
 * switch walks two partitions), and filtering per id parsed every key
 * once per id — O(ids × keys) key parses for what is one pass.
 *
 * TODO(demand-loading): the roadmap replaces these callers with exact-key
 * reads (the over-fetch here is transitional); this helper goes with them.
 */
export function indexScopeByLeafDefinition(
  componentScope: Record<string, unknown> | undefined,
): Map<string, string[]> {
  const byDefinition = new Map<string, string[]>();
  for (const key of Object.keys(componentScope ?? {})) {
    const definitionId = leafDefinitionIdFor(key);
    const stateIds = byDefinition.get(definitionId);
    if (stateIds) stateIds.push(key);
    else byDefinition.set(definitionId, [key]);
  }
  return byDefinition;
}

/**
 * HACK: Ephemeral namespaces are identified by the `docs.` prefix.
 * Their field state is never folded, persisted, or returned on content fetches
 * — a page refresh starts clean.
 *
 * Currently the `docs.<BlockName>` namespaces (block-documentation demo
 * sandboxes, lib/storage/lofs/providers/docs.ts): poking a docs example is
 * exploration, not coursework.
 *
 * TODO(persistence): make this an explicit content-source or namespace policy
 * (for example, persistence: 'ephemeral') rather than inferring it from an
 * identifier's spelling.
 */
export function isEphemeralNamespaceKey(key: DefinitionKey | StateKey): boolean {
  return key.startsWith('docs.');
}
