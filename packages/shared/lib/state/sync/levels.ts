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
