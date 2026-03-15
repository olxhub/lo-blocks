// lib/state/fieldTypes/stateField.ts
//
// State field — the default field type for block state.
//
// This file is an advertisement for how to create new field types. A field
// type is a thin wrapper around a CRDT algorithm: it assembles a FieldInfo
// object from CRDT primitives (write, reduce, display) plus field metadata
// (name, events, scope).
//
// stateField wraps the LWW (last-writer-wins) register from lib/crdt/lww.ts.
// It's the simplest possible field: store a value, resolve conflicts by
// timestamp. Every field declared as a bare string — `fields: ['value']` —
// becomes a stateField automatically.
//
// The name comes from React's useState — the API is identical (a value +
// setter), plus a props and field argument. docField is different: it's not
// a simple get/set, it's a structured document with splice-based editing.
//
// To create a new field type:
//   1. Implement the CRDT in lib/crdt/ (write, reduce, display, merge)
//   2. Create a new file in this directory (fieldTypes/)
//   3. Export a constructor that assembles FieldInfo from the CRDT primitives
//   4. Add the export to fieldTypes/index.ts
//
// See also: docField.ts (collaborative text via RGA CRDT)
//
// Behavior summary:
//   - read:     identity (value stored bare, no unwrapping needed)
//   - write:    adds timestamp + actor for sync (via lwwWrite)
//   - reduce:   compares timestamps, rejects stale writes (via lwwReduce)
//   - display:  String() for primitives, JSON.stringify for objects
//   - equality: referential (Object.is)
//   - events:   UPDATE_{NAME} (single event, derived from field name)
//
import { scopes } from '../scopes';
import { lwwWrite, lwwReduce, defaultDisplay } from '../../crdt/lww';
import { fieldNameToDefaultEventName } from './shared';
import type { FieldInfo, FieldName, FieldEvent } from '../../types';

/**
 * State field — the default field type.
 *
 * Creates a last-writer-wins register: value + timestamp + actor.
 * This is what `fields(['value'])` and `commonFields.value` produce.
 * For collaborative text, use docField() instead.
 */
export function stateField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
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
    ...(opts?.schema ? { schema: opts.schema } : {}),
    ...(opts?.read ? { read: opts.read } : {}),
    ...(opts?.equality ? { equality: opts.equality } : {}),
  };
}
