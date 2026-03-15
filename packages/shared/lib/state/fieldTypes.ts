// src/lib/state/fieldTypes.ts
//
// Field type constructors — create FieldInfo objects with type-specific behavior.
//
// Every field is a complete behavioral bundle: read, write, reduce, display,
// equality, events. Block authors write the minimal form:
//   fields: [docField('value'), 'readonly']
// and the constructors fill in all behaviors. Bare strings like 'readonly'
// produce LWW (last-writer-wins) fields via plainField().
//
// Field types:
//   plainField — LWW register. The default. Stores value + timestamp + actor.
//                Value is bare (not wrapped); metadata stored as sibling keys.
//   docField   — RGA CRDT for collaborative text. Stores RgaDoc, materializes
//                to string. Splice-based editing with auto-compaction.
//
// Future types (see breadcrumbs at bottom):
//   setField, counterField
//
import { scopes } from './scopes';
import { rgaCreate, rgaInsert, rgaSplice, rgaText, rgaCompact, rgaVersionVector } from '../crdt/rga';
import { computeSplice } from '../crdt/computeSplice';
import { getActorId } from '../crdt/actorId';
import type { FieldInfo, FieldName, FieldEvent, WriteResult } from '../types';

// =============================================================================
// Shared utilities
// =============================================================================

/**
 * Converts a camelCase field name into a default event name.
 * Example: fieldNameToDefaultEventName('submitCount') → 'UPDATE_SUBMIT_COUNT'
 */
export function fieldNameToDefaultEventName(name: string): FieldEvent {
  return ('UPDATE_' + name.replace(/([a-z\d])([A-Z])/g, '$1_$2').toUpperCase()) as FieldEvent;
}

// =============================================================================
// LWW (last-writer-wins) — default field behavior
// =============================================================================
//
// LWW stores the value bare in componentState[fieldName], with timestamp and
// actor as sibling keys (fieldName.ts, fieldName.actor). This is the same
// pattern used for selection state (fieldName.selectionStart, etc.).
//
// Existing code that reads state[fieldName] directly (e.g., useReduxInput)
// still works — the value is never wrapped. When hooks are consolidated,
// all writes will go through field.write and all reads through field.read.
//
// For sync: the reduce function compares timestamps and rejects stale writes.
// Events dispatched without ts/actor (legacy paths) get wall-clock defaults.

/** LWW write: adds field name, timestamp, and actor to the event payload. */
function lwwWrite(fieldName: string, event: FieldEvent) {
  return (oldRaw: any, newValue: any): WriteResult[] => [{
    event,
    payload: { field: fieldName, [fieldName]: newValue, ts: Date.now(), actor: getActorId() },
  }];
}

/** LWW reduce: compare timestamps, store value + metadata as sibling keys. */
function lwwReduce(componentState: Record<string, any>, action: any, fieldName: string): Record<string, any> {
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

/** Default display: stringify for humans/LLMs. */
function defaultDisplay(raw: any): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

// =============================================================================
// Field constructors
// =============================================================================

/**
 * Plain (LWW) field — the default field type.
 *
 * - read: identity (value stored bare, no unwrapping needed)
 * - write: adds timestamp + actor for sync
 * - reduce: LWW — compares timestamps, rejects stale writes
 * - display: String() for primitives, JSON.stringify for objects
 * - equality: referential (Object.is)
 * - events: UPDATE_{NAME} (single event)
 *
 * This is what `fields(['value'])` and `commonFields.value` produce.
 * For collaborative text, use docField() instead.
 */
export function plainField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  const defaultEv = fieldNameToDefaultEventName(name);
  // Resolve the actual event — opts may override with a custom event name
  const events = opts?.events ?? (opts?.event ? [opts.event as FieldEvent] : [defaultEv]);
  const event = events[0];
  return {
    type: 'field',
    name: name as FieldName,
    events,
    event: event as string,
    scope: opts?.scope ?? scopes.component,
    write: opts?.write ?? lwwWrite(name, event),
    reduce: opts?.reduce ?? lwwReduce,
    display: opts?.display ?? defaultDisplay,
    // Spread remaining opts (schema, read, equality, etc.) but events/write/reduce
    // are already resolved above, so opts won't re-override them
    ...(opts?.schema ? { schema: opts.schema } : {}),
    ...(opts?.read ? { read: opts.read } : {}),
    ...(opts?.equality ? { equality: opts.equality } : {}),
  };
}

/**
 * CRDT document field — stores an RgaDoc in Redux, materializes to string via rgaText().
 *
 * - read: RgaDoc → string (also handles plain string for backward compat / pre-init state)
 * - write: computes splice delta from old text → new text
 * - reduce: applies rgaSplice + compaction, auto-inits RgaDoc on first edit
 * - display: same as read (both produce a string)
 * - equality: referential (each rgaSplice produces a new object; no-ops don't)
 * - events: SPLICE_INPUT (insert/delete deltas)
 */
export function docField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  return {
    type: 'field',
    name: name as FieldName,
    events: ['SPLICE_INPUT' as FieldEvent],
    event: 'SPLICE_INPUT',
    scope: scopes.component,
    read: (raw: any): string => {
      if (!raw) return '';
      if (typeof raw === 'string') return raw;
      if (raw.ops) return rgaText(raw);
      return '';
    },
    display: (raw: any): string => {
      if (!raw) return '';
      if (typeof raw === 'string') return raw;
      if (raw.ops) return rgaText(raw);
      return '';
    },
    write: (oldRaw: any, newValue: any): WriteResult[] => {
      const newText = String(newValue ?? '');
      const oldText = oldRaw?.ops ? rgaText(oldRaw) : (typeof oldRaw === 'string' ? oldRaw : '');
      const splice = computeSplice(oldText, newText);
      if (splice.deleteCount === 0 && splice.inserted.length === 0) return [];
      const needsInit = !oldRaw || typeof oldRaw !== 'object' || !oldRaw.ops;
      return [{
        event: 'SPLICE_INPUT' as FieldEvent,
        payload: {
          field: name,
          index: splice.index,
          deleteCount: splice.deleteCount,
          inserted: splice.inserted,
          ...(needsInit ? { initText: oldText, actor: getActorId() } : {}),
        }
      }];
    },
    reduce: (componentState: Record<string, any>, action: any, fieldName: string) => {
      const { index, deleteCount, inserted, selectionStart, selectionEnd, initText, actor } = action;
      let doc = componentState[fieldName];

      // Auto-init on first splice: create RgaDoc from existing value or initText
      if (!doc || typeof doc !== 'object' || !doc.ops) {
        const text = typeof doc === 'string' ? doc : (initText ?? '');
        doc = rgaCreate(actor ?? 'default');
        if (text) doc = rgaInsert(doc, 0, text);
      }

      doc = rgaSplice(doc, index, deleteCount, inserted);
      doc = rgaCompact(doc, rgaVersionVector(doc));  // Single-user: all ops are seen

      return {
        [fieldName]: doc,
        [`${fieldName}.selectionStart`]: selectionStart,
        [`${fieldName}.selectionEnd`]: selectionEnd,
      };
    },
    equality: Object.is,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Future field type constructors (breadcrumbs)
// ---------------------------------------------------------------------------
//
// export function setField(name: string, opts?): FieldInfo {
//   // Stores an OR-Set CRDT. Materializes to Set<T>.
//   // events: ['SET_ADD', 'SET_REMOVE']
//   // read: (raw: OrSetDoc) => new Set(orSetElements(raw))
//   // display: (raw) => orSetElements(raw).join(', ')
//   // reduce: handles SET_ADD and SET_REMOVE events
//   // merge: orSetMerge — union of adds, union of removes, add wins
//   // Consumer API via useField: { add(item), remove(item), has(item), values }
// }
//
// export function counterField(name: string, opts?): FieldInfo {
//   // Stores a G-Counter (or PN-Counter) CRDT. Materializes to number.
//   // events: ['COUNTER_INCREMENT', 'COUNTER_DECREMENT']
//   // read: (raw: CounterDoc) => counterValue(raw)
//   // display: (raw) => String(counterValue(raw))
//   // reduce: per-actor increment/decrement
//   // merge: gCounterMerge — per-actor max
//   // Consumer API via useField: { value, increment(n?), decrement(n?) }
// }
//
// Design notes:
//
// Each constructor produces a complete FieldInfo with sensible defaults.
// Block authors write the minimal form and the field system fills in everything.
// The blueprint normalization layer (in blocks.ts) can also expand bare strings
// like 'value' into plainField('value'), keeping the authoring surface minimal.
