// lib/crdt/set.ts
//
// LWW-Element Set — an add/remove set with per-element conflict resolution.
//
// Each element is tracked independently: a timestamp + actor determine whether
// an add or remove "wins" for that element. This mirrors how lww.ts uses LWW
// for a single value, but applied per element in a set.
//
// Simpler than a full OR-Set (no version vectors or tombstone GC) but correct
// for the same use cases. Trades space (removed entries stay forever) for
// simplicity. Compaction can be added later if needed.
//
// Storage format (raw Redux value — a SetDoc):
//   { 'SVD': { ts: 123, actor: 'abc' },
//     'Linear': { ts: 124, actor: 'def', removed: true } }
//
// Consumer-facing value (via setRead): Set<string>
// Only non-removed elements appear in the Set.
//
// Relationship to other CRDTs in this directory:
//   - lww.ts: register CRDT for single values (used by stateField)
//   - rga.ts: sequence CRDT for collaborative text (used by docField)
//   - set.ts: set CRDT for add/remove sets (used by setField)
//   All are plain JS objects, Redux-serializable, no WASM or binary formats.
//
import { getActorId } from './actorId';
import type { FieldEvent, WriteResult } from '../types';

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

/** LWW metadata for a single element in the set. */
export interface ElementMeta {
  ts: number;
  actor: string;
  removed?: boolean;
}

/**
 * Raw Redux storage — map from element (string) to its LWW metadata.
 * An element is "in" the set when its entry exists and !removed.
 */
export type SetDoc = Record<string, ElementMeta>;

// ---------------------------------------------------------------------------
// CRDT operations
// ---------------------------------------------------------------------------

/** Materialize a SetDoc to a consumer-facing Set<string>. */
export function setRead(raw: any): Set<string> {
  if (!raw || typeof raw !== 'object') return new Set();
  if (raw instanceof Set) return raw;  // already materialized (idempotent)
  const result = new Set<string>();
  for (const [element, meta] of Object.entries(raw as SetDoc)) {
    if (meta && typeof meta === 'object' && !(meta as ElementMeta).removed) {
      result.add(element);
    }
  }
  return result;
}

/** Human/LLM-readable display: comma-separated active elements. */
export function setDisplay(raw: any): string {
  const set = setRead(raw);
  if (set.size === 0) return '';
  return [...set].join(', ');
}

/**
 * Produce add/remove events by diffing old SetDoc against new Set<string>.
 * Delta encoding: only changed elements produce events.
 */
export function setWrite(fieldName: string): (oldRaw: any, newValue: any) => WriteResult[] {
  return (oldRaw: any, newValue: any): WriteResult[] => {
    const oldSet = setRead(oldRaw);
    const newSet: Set<string> = newValue instanceof Set
      ? newValue
      : new Set(Array.isArray(newValue) ? newValue : []);

    const results: WriteResult[] = [];
    const ts = Date.now();
    const actor = getActorId();

    for (const element of newSet) {
      if (!oldSet.has(element)) {
        results.push({
          event: 'SET_ADD' as FieldEvent,
          payload: { field: fieldName, element, ts, actor },
        });
      }
    }

    for (const element of oldSet) {
      if (!newSet.has(element)) {
        results.push({
          event: 'SET_REMOVE' as FieldEvent,
          payload: { field: fieldName, element, ts, actor },
        });
      }
    }

    return results;
  };
}

/**
 * Apply a single SET_ADD or SET_REMOVE event to the SetDoc.
 * LWW per element: newer timestamp always wins.
 */
export function setReduce(
  componentState: Record<string, any>,
  action: any,
  fieldName: string,
): Record<string, any> {
  const { element, ts = Date.now(), actor = getActorId() } = action;
  if (element === undefined || element === null) return {};

  const doc: SetDoc = componentState[fieldName]
    ? { ...componentState[fieldName] }
    : {};

  const existing = doc[element];
  // Reject stale: newer timestamp wins. On tie, higher actor wins.
  if (existing && existing.ts > ts) return {};
  if (existing && existing.ts === ts && existing.actor > actor) return {};

  const isAdd = (action.type || action.event) === 'SET_ADD';
  doc[element] = isAdd
    ? { ts, actor }
    : { ts, actor, removed: true };

  return { [fieldName]: doc };
}
