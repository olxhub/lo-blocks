// packages/shared/lib/crdt/lww.ts
//
// Last-Writer-Wins Register — the simplest useful CRDT.
//
// A LWW register resolves conflicts by timestamp: the newest write wins.
// On timestamp tie, the higher actor ID breaks the tie deterministically.
// This is the default conflict resolution for all block state fields.
//
// How it works:
//   1. Every write carries a value, a timestamp, and an actor ID.
//   2. On reduce, compare the incoming timestamp against the stored one.
//   3. If the incoming is newer (or same time + higher actor), accept it.
//   4. Otherwise, reject it silently (return empty patch).
//
// Storage format:
//   The value is stored bare in componentState[fieldName], with timestamp
//   and actor as sibling keys:
//     { value: 'hello', 'value.ts': 1710000000, 'value.actor': 'uuid-123' }
//
//   The prefixed siblings are LWW's own bookkeeping, invisible to readers —
//   code that reads state[fieldName] directly still gets the value without
//   unwrapping. (Cursor state, which once rode the same prefix convention,
//   is now a real `selection` field carried by the event's extras envelope
//   — see store.ts.)
//
// Relationship to other CRDTs in this directory:
//   - text/: sequence CRDT for collaborative text, via docText.ts (used by docField)
//   - lww.ts: register CRDT for simple values (used by stateField)
//   Both are plain JS objects, Redux-serializable, no WASM or binary formats.
//
import { getActorId } from './actorId';
import type { FieldEvent, WriteResult } from '../types';

/**
 * LWW write: produces an event payload with the field value, timestamp, and actor.
 *
 * Returns a curried function (oldRaw, newValue) → WriteResult[] that creates
 * a single event with the new value and LWW metadata.
 */
export function lwwWrite(fieldName: string, event: FieldEvent) {
  return (oldRaw: any, newValue: any): WriteResult[] => [{
    event,
    payload: { field: fieldName, [fieldName]: newValue, ts: Date.now(), actor: getActorId() },
  }];
}

/**
 * LWW reduce: compare timestamps, accept newer writes, reject stale ones.
 *
 * Returns a patch object to merge into componentState. Empty object means
 * the write was stale (existing value is newer) — nothing changes.
 */
export function lwwReduce(componentState: Record<string, any>, action: any, fieldName: string): Record<string, any> {
  // Aggregate events (the encode axis — lib/state/encode.ts) carry a
  // sample trace instead of a single value; live state takes the LAST
  // sample, stamped at its own time. Replay expands the full trace.
  if (Array.isArray(action.samples) && action.samples.length > 0) {
    const [dt, value] = action.samples[action.samples.length - 1];
    action = { ...action, [fieldName]: value, ts: (action.startTs ?? 0) + dt };
  }
  const newValue = action[fieldName];
  const ts = action.ts ?? Date.now();
  const actor = action.actor ?? getActorId();

  // Reject stale writes: newer timestamp wins.
  // On tie, higher actor ID wins (deterministic across all peers).
  const existingTs = componentState[`${fieldName}.ts`] ?? 0;
  if (existingTs > ts) return {};
  if (existingTs === ts) {
    const existingActor = componentState[`${fieldName}.actor`] ?? '';
    if (existingActor > actor) return {};
  }

  return {
    [fieldName]: newValue,
    [`${fieldName}.ts`]: ts,
    [`${fieldName}.actor`]: actor,
  };
}

/** Is `key` one of LWW's own bookkeeping siblings (`value.ts`/`value.actor`)
 * rather than a field in its own right? Field names are identifiers — the
 * dot is this module's own convention, so the suffix test is exact. */
function isLwwSibling(key: string): boolean {
  return key.endsWith('.ts') || key.endsWith('.actor');
}

/**
 * Reconcile two whole buckets FIELD BY FIELD under the same rule
 * `lwwReduce` applies to a single write: newer timestamp wins, ties broken
 * by the higher actor, and `incoming` wins when neither side is stamped.
 *
 * This is the "two copies met without seeing each other's events" path —
 * a snapshot landing on a live store (fetch_blob), a materialization being
 * seeded after it has already folded events (ServerState.seed). Picking a
 * side wholesale is what those call sites used to do, and it is how a
 * STALE copy silently reverts a newer one: a client that reconnects after
 * a day flushes its durable outbox before it asks for state, so the
 * server's materialization holds day-old writes at the moment the stored
 * (newer) snapshot arrives — "live wins" then throws away the newer work.
 * Comparing timestamps costs nothing here and makes the merge agree with
 * every other fold in the system.
 *
 * Returns `base` itself when nothing changed, so callers keep their
 * same-object-when-unchanged guarantees.
 */
export function lwwMergeBuckets<T extends Record<string, any>>(
  base: T | undefined,
  incoming: Record<string, any> | undefined,
): T {
  if (!incoming) return (base ?? {}) as T;
  if (!base) return incoming as T;
  let result: Record<string, any> | undefined;
  for (const [field, value] of Object.entries(incoming)) {
    // Siblings ride with the field they belong to; they are never merged
    // on their own (a bare `value.ts` has no value to order).
    if (isLwwSibling(field)) continue;
    const ts = incoming[`${field}.ts`] ?? 0;
    const baseTs = base[`${field}.ts`] ?? 0;
    if (baseTs > ts) continue;
    if (baseTs === ts && (base[`${field}.actor`] ?? '') > (incoming[`${field}.actor`] ?? '')) continue;
    if (field in base && base[field] === value
      && base[`${field}.ts`] === incoming[`${field}.ts`]
      && base[`${field}.actor`] === incoming[`${field}.actor`]) continue;
    result ??= { ...base };
    result[field] = value;
    if (`${field}.ts` in incoming) result[`${field}.ts`] = incoming[`${field}.ts`];
    if (`${field}.actor` in incoming) result[`${field}.actor`] = incoming[`${field}.actor`];
  }
  return (result ?? base) as T;
}

/**
 * Default display: produce a human/LLM-readable string from a raw value.
 *
 * Used by stateField. docField overrides this with its document's text.
 */
export function defaultDisplay(raw: any): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}
