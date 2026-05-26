// lib/state/fieldTypes/classic/state.ts
//
// Classic state field — direct value storage, no timestamps, no conflict resolution.
//
// This is the behavior from main: values stored bare in Redux, the reducer
// spreads action payload into component state. No write/reduce/read transforms.
//
// Equivalent to what `fields(['value'])` produces on main. When the classic
// barrel is active (the default), all bare string field declarations like
// `fields(['value', 'count'])` produce these fields.
//
// No write → updateField falls through to direct logEvent(field.event, { [fieldName]: newValue }).
// No reduce → reducer falls through from field-level lookup to legacy-spread.
// No read → useFieldSelector returns raw value (bare in Redux).
//
import { scopes } from '../../scopes';
import { fieldNameToDefaultEventName } from '../shared';
import type { FieldInfo, FieldName, FieldEvent } from '../../../types';

/**
 * Classic state field — no CRDT primitives.
 *
 * Creates a bare field: value stored directly in Redux, no timestamps,
 * no conflict resolution. This is the battle-tested production behavior.
 */
export function stateField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  const event = opts?.event ?? fieldNameToDefaultEventName(name);
  const events = opts?.events ?? [event as FieldEvent];
  return {
    type: 'field',
    name: name as FieldName,
    event: events[0] as string,
    events,
    scope: opts?.scope ?? scopes.component,
    ...(opts?.schema ? { schema: opts.schema } : {}),
    ...(opts?.read ? { read: opts.read } : {}),
    ...(opts?.equality ? { equality: opts.equality } : {}),
    ...(opts?.batching ? { batching: opts.batching } : {}),
    ...(opts?.url ? { url: opts.url } : {}),
    ...(opts?.urlDefault ? { urlDefault: opts.urlDefault } : {}),
    ...(opts?.urlPush ? { urlPush: opts.urlPush } : {}),
  };
}
