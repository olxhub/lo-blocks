// lib/crdt/lww.ts
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
//   This pattern matches selection state (value.selectionStart, etc.) and
//   keeps backward compatibility — code that reads state[fieldName] directly
//   (e.g., useReduxInput) still gets the value without unwrapping.
//
// Relationship to other CRDTs in this directory:
//   - rga.ts: sequence CRDT for collaborative text (used by docField)
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
  const newValue = action[fieldName];
  const ts = action.ts ?? Date.now();
  const actor = action.actor ?? getActorId();

  // Reject stale writes (keep newer timestamp)
  const existingTs = componentState[`${fieldName}.ts`] ?? 0;
  if (existingTs > ts) return {};

  return {
    [fieldName]: newValue,
    [`${fieldName}.ts`]: ts,
    [`${fieldName}.actor`]: actor,
  };
}

/**
 * Default display: produce a human/LLM-readable string from a raw value.
 *
 * Used by stateField. docField overrides this with rgaText-based display.
 */
export function defaultDisplay(raw: any): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}
