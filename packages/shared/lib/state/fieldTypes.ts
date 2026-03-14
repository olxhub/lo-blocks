// src/lib/state/fieldTypes.ts
//
// Field type constructors — create FieldInfo objects with type-specific behavior.
//
// Each constructor sets read, equality, and events appropriate for the
// field's storage type. Use these in block definitions instead of bare
// strings or commonFields when the field needs non-default behavior.
//
// Usage:
//   import { docField } from '@/lib/state/fieldTypes';
//   export const fields = state.fields([docField('value'), 'readonly']);
//
import { scopes } from './scopes';
import { fieldNameToDefaultEventName } from './fields';
import { rgaText } from '../crdt/rga';
import { computeSplice } from '../crdt/computeSplice';
import { getActorId } from '../crdt/actorId';
import type { FieldInfo, FieldName, FieldEvent, WriteResult } from '../types';

/**
 * Plain field — identity read, reference equality.
 * This is the default field type, equivalent to what `fields(['value'])` produces.
 * Explicit constructor for when you want to pass additional options.
 */
export function plainField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  const ev = fieldNameToDefaultEventName(name);
  return {
    type: 'field',
    name: name as FieldName,
    events: [ev],
    event: ev as string,
    scope: scopes.component,
    ...opts,
  };
}

/**
 * CRDT document field — stores an RgaDoc in Redux, materializes to string via rgaText().
 *
 * - read: RgaDoc → string (also handles plain string for backward compat / pre-init state)
 * - equality: referential (each rgaSplice produces a new object; no-ops don't)
 * - events: SPLICE_INPUT (insert/delete deltas)
 *
 * The reducer (SPLICE_INPUT handler in store.ts) auto-initializes the RgaDoc on
 * first edit. Before any edits, the raw value may be undefined or a plain string.
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
    // Referential equality — each splice produces a new RgaDoc object.
    // This is the default (Object.is), so we don't need to set it explicitly,
    // but being explicit here documents the intent.
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
//   // merge: orSetMerge — union of adds, union of removes, add wins
//   // Consumer API via useField: { add(item), remove(item), has(item), values }
// }
//
// export function counterField(name: string, opts?): FieldInfo {
//   // Stores a G-Counter (or PN-Counter) CRDT. Materializes to number.
//   // events: ['COUNTER_INCREMENT', 'COUNTER_DECREMENT']
//   // read: (raw: CounterDoc) => counterValue(raw)
//   // display: (raw) => String(counterValue(raw))
//   // merge: gCounterMerge — per-actor max
//   // Consumer API via useField: { value, increment(n?), decrement(n?) }
// }
//
// export function lwwField(name: string, opts?): FieldInfo {
//   // Last-writer-wins register with timestamps.
//   // Stores { value, ts, actor }. Materializes to the value.
//   // events: ['LWW_SET']
//   // read: (raw) => raw?.value
//   // display: (raw) => JSON.stringify(raw?.value)
//   // merge: (local, remote) => remote.ts > local.ts ? remote : local
//   // reduce: (state, action) => action.ts > (state?.ts ?? 0) ? action : state
//   // serverReduce: same as reduce (authoritative; grade checks run separately)
//   // batching: { strategy: 'immediate' }  — state writes are infrequent
//   // This is the future default for all "plain" state fields — enables
//   // offline sync by comparing timestamps.
// }
//
// Design notes for field constructors:
//
// Each constructor should produce a complete FieldInfo with sensible defaults
// for all behavioral properties. Block authors write the minimal form:
//   fields: [docField('value'), 'readonly']
// and the field system fills in events, read, display, reduce, merge, etc.
//
// The blueprint normalization layer (in blocks.ts) can also expand bare strings
// like 'value' into plainField('value'), so the authoring surface stays minimal
// while the runtime has everything it needs.
