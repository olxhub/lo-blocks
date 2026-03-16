// lib/state/fieldTypes/crdt/setConstructor.ts
//
// Set field constructor — no React, no Redux. Separated from set.ts to
// break the circular dependency: fieldTypes/index → redux → fields → fieldTypes.
//
// The constructor assembles a FieldInfo from CRDT primitives. It's safe
// to import during module initialization. The hook (useSet) is in set.ts
// and imports from redux.ts — it's loaded lazily by components, not by barrels.
//
import { scopes } from '../../scopes';
import { setRead, setWrite, setReduce, setDisplay } from '../../../crdt/set';
import type { FieldInfo, FieldName, FieldEvent } from '../../../types';

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
 * For the natural Set API (has, add, del), use useSet instead of useField.
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
