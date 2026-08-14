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
 * Which state ids in a MATERIALIZED component scope belong to `definitionId`.
 *
 * This is the ONE place that answers that question. It exists because
 * scoped instances cannot be enumerated from content: only a container's
 * own state knows that `demos/list:#2:chat` exists at all, so a consumer
 * that already holds a materialized scope answers by FILTERING the keys
 * it has in hand — no reverse index, no KVS enumeration, no extra I/O.
 *
 *   stateIdsForDefinition({ 'demos/chat': {}, 'demos/list:#2:chat': {} },
 *                         'demos/chat')
 *   → ['demos/chat', 'demos/list:#2:chat']
 *
 * Matching is by LEAF DEFINITION (leafDefinitionIdFor): scope segments
 * only pick WHICH copy, so every scoped copy belongs to its definition,
 * and a bare DefinitionKey is a StateKey whose leaf is itself — the
 * exact-id case falls out as a special case. Ids that are not StateKeys
 * (componentSetting tags, storage URIs, system ids) map to themselves,
 * so they match only when equal to `definitionId`.
 *
 * TODO(demand-loading): the roadmap replaces these callers with exact-key
 * reads (the over-fetch here is transitional); this helper goes with them.
 */
export function stateIdsForDefinition(
  componentScope: Record<string, unknown> | undefined,
  definitionId: string,
): string[] {
  if (!componentScope) return [];
  return Object.keys(componentScope).filter(
    (key) => leafDefinitionIdFor(key) === definitionId,
  );
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
