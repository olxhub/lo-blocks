// lib/state/fieldTypes/classic/id.ts
//
// Classic ID field — monotonic counter that generates unique, stable IDs.
//
// Used by blocks like Annotate where each item needs a unique scope marker.
// Unlike DynamicList's sequential indices (#0, #1, ...), these IDs are stable
// across deletions — deleting item "2" doesn't shift "3" to "2".
//
// State is a plain number (the counter). Each nextId() call increments it
// and returns the old value as a string: "0", "1", "2", ...
//
// The allocated ID appears in the event payload (allocatedId field) so
// analytics consumers can replay which IDs were generated and when.
//
// See also: crdt/id.ts for the actor-prefixed variant.
//
import { scopes } from '../../scopes';
import { fieldNameToDefaultEventName } from '../shared';
import type { FieldInfo, FieldName, FieldEvent, WriteResult } from '../../../types';

/**
 * Classic ID field — monotonic counter for unique ID generation.
 *
 * Creates a field whose value is a counter (number). Each write increments
 * the counter and produces an event with `allocatedId: String(oldCount)`.
 *
 * The block author never touches the counter directly — they call
 * `useNextId(props, field)` which returns a `() => string` callback.
 */
export function idField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  const event = opts?.event ?? fieldNameToDefaultEventName(name);
  const events = opts?.events ?? [event as FieldEvent];
  return {
    type: 'field',
    kind: 'id',
    name: name as FieldName,
    events,
    event: events[0] as string,
    scope: opts?.scope ?? scopes.component,

    read(raw: any): number {
      return typeof raw === 'number' ? raw : 0;
    },

    write(oldRaw: any, _newValue: any): WriteResult[] {
      const counter = typeof oldRaw === 'number' ? oldRaw : 0;
      return [{
        event: events[0],
        payload: {
          field: name,
          [name]: counter + 1,
          allocatedId: String(counter),
        },
      }];
    },

    reduce(componentState: Record<string, any>, action: any, fieldName: string): Record<string, any> {
      const incoming = action[fieldName];
      if (typeof incoming !== 'number') return {};
      const current = componentState[fieldName] ?? 0;
      // Monotonic: only advance, never decrease
      if (incoming <= current) return {};
      return { [fieldName]: incoming };
    },

    display(raw: any): string {
      const count = typeof raw === 'number' ? raw : 0;
      return `${count} id${count === 1 ? '' : 's'} allocated`;
    },

    ...(opts?.schema ? { schema: opts.schema } : {}),
    ...(opts?.equality ? { equality: opts.equality } : {}),
    ...(opts?.batching ? { batching: opts.batching } : {}),
  };
}
