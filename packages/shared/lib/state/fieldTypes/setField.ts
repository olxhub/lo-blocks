// lib/state/fieldTypes/setField.ts
//
// Set field — an add/remove set with LWW-element conflict resolution.
//
// Each element is tracked independently: timestamp determines whether
// an add or remove "wins" for that element. This mirrors how stateField
// uses LWW for a single value, but applied per element.
//
// Storage format (raw Redux value):
//   { 'SVD': { ts: 123, actor: 'abc' },
//     'Linear': { ts: 124, actor: 'def', removed: true } }
//
// Consumer-facing value (via read): Set<string>
// Only non-removed elements appear in the Set.
//
// Events: SET_ADD and SET_REMOVE (protocol-level, like docField's
// SPLICE_INPUT). The `field` property in each event payload routes
// to the correct field name in the reducer.
//
// Use case: track visited pages, selected tags, unlocked features.
//   const fields = state.fields([setField('visited')]);
//   const [visited, setVisited] = useField(props, fields.visited);
//   setVisited(new Set([...visited, 'SVD']));  // add
//   if (visited.has('SVD')) { /* unlock glossary tab */ }
//
// Like stateField's name comes from React's useState, setField's name
// comes from JavaScript's Set — the consumer-facing value is a Set with
// the same API (has, forEach, size, iteration).
//
import { scopes } from '../scopes';
import { getActorId } from '../../crdt/actorId';
import type { FieldInfo, FieldName, FieldEvent, WriteResult } from '../../types';

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

/** LWW metadata for a single element in the set. */
interface ElementMeta {
  ts: number;
  actor: string;
  removed?: boolean;
}

/**
 * Raw Redux storage — map from element (string) to its LWW metadata.
 * An element is "in" the set when its entry exists and !removed.
 */
type SetDoc = Record<string, ElementMeta>;

// ---------------------------------------------------------------------------
// CRDT operations
// ---------------------------------------------------------------------------
// LWW-element set: each element has independent LWW conflict resolution.
// Concurrent add+remove of the *same* element resolves by timestamp.
// Concurrent operations on *different* elements never conflict.
//
// This is simpler than a full OR-Set (no version vectors or tombstone GC)
// but correct for the same use cases. It trades space (removed entries stay
// forever) for simplicity. Compaction can be added later if needed.
// ---------------------------------------------------------------------------

/** Materialize a SetDoc to a consumer-facing Set<string>. */
function setRead(raw: any): Set<string> {
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
function setDisplay(raw: any): string {
  const set = setRead(raw);
  if (set.size === 0) return '';
  return [...set].join(', ');
}

/**
 * Produce add/remove events by diffing old SetDoc against new Set<string>.
 * Delta encoding: only changed elements produce events.
 */
function setWrite(fieldName: string): (oldRaw: any, newValue: any) => WriteResult[] {
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
function setReduce(
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
  if (existing && existing.ts > ts) return {};  // stale, reject

  const isAdd = action.type === 'SET_ADD';
  doc[element] = isAdd
    ? { ts, actor }
    : { ts, actor, removed: true };

  return { [fieldName]: doc };
}

// ---------------------------------------------------------------------------
// Field constructor
// ---------------------------------------------------------------------------

/**
 * Set field — an add/remove set with LWW-element conflict resolution.
 *
 * Materializes to Set<string>. Consumer API follows the useState pattern:
 *   const [tags, setTags] = useField(props, fields.tags);
 *   setTags(new Set([...tags, 'new-tag']));
 *
 * Also accepts arrays for convenience:
 *   setTags(['a', 'b', 'c']);
 *
 * @example
 *   // Track visited lessons, unlock content on visit
 *   export const fields = state.fields([setField('visited')]);
 *   // In component:
 *   const [visited, setVisited] = useField(props, fields.visited);
 *   setVisited(new Set([...visited, 'SVD']));
 *   if (visited.has('SVD')) { /* show SVD glossary tab *\/ }
 */
export function setField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  const events = opts?.events ?? ['SET_ADD' as FieldEvent, 'SET_REMOVE' as FieldEvent];
  return {
    type: 'field',
    kind: 'set',
    name: name as FieldName,
    events,
    event: events[0] as string,
    scope: opts?.scope ?? scopes.component,
    read: opts?.read ?? setRead,
    write: opts?.write ?? setWrite(name),
    reduce: opts?.reduce ?? setReduce,
    display: opts?.display ?? setDisplay,
    equality: opts?.equality ?? Object.is,
    ...(opts?.schema ? { schema: opts.schema } : {}),
    ...(opts?.batching ? { batching: opts.batching } : {}),
  };
}
