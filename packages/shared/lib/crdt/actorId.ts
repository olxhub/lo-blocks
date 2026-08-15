// packages/shared/lib/crdt/actorId.ts
//
// Who this client is, in CRDT operations. Two identifiers, because the
// CRDTs here disagree about what an identity looks like:
//
//   getActorId()   a UUID string — lww.ts, set.ts, log.ts
//   getClientId()  a 48-bit integer — the sequence CRDT (./text)
//
// Both are lazy singletons: one identity per browser session (tab), so
// two tabs are two writers and their concurrent edits resolve rather
// than collide. Neither survives a reload, which is what Yjs does too:
// a document rebuilt from storage is a new writer appending to a history
// that already names its predecessors.
//
// Uses crypto when available (all modern browsers, Node 19+), falling
// back to timestamp/Math.random for older test environments.
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

/** Module-level lazy singleton — numeric client ID per browser session. */
let _clientId: number | null = null;

/**
 * This session's client ID for the sequence CRDT.
 *
 * 48 bits of randomness, as Yjs uses: every inserted code unit is
 * addressed by (client, clock), and two live documents minting
 * operations under one client ID is the one thing the algorithm cannot
 * merge — it is rejected as a conflict rather than silently interleaved.
 *
 * Never 0. Documents that only fold updates and never write use 0 (see
 * crdt/docText.ts), and reserving it keeps that free by construction.
 */
export function getClientId(): number {
  if (_clientId === null) {
    const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(6))
      : Uint8Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    _clientId = value === 0 ? 1 : value;
  }
  return _clientId;
}
