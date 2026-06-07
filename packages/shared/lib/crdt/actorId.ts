// packages/shared/lib/crdt/actorId.ts
//
// Actor ID — unique identifier for this client in CRDT operations.
//
// Lazy singleton: generated once per browser session (tab). Used by
// lww.ts, rga.ts, and set.ts to tag writes with their origin. Two tabs
// get different actor IDs, enabling conflict resolution on merge.
//
// Uses crypto.randomUUID() when available (all modern browsers),
// falls back to timestamp + random for Node.js test environments.
//

/** Module-level lazy singleton — unique actor ID per browser session. */
let _actorId: string | null = null;

export function getActorId(): string {
  if (!_actorId) {
    _actorId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `actor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return _actorId;
}
