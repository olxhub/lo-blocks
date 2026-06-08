// packages/shared/lib/state/fieldTypes/crdt/set.ts
//
// CRDT set field — constructor + useSet hook.
//
// useSet dispatches individual SET_ADD / SET_REMOVE events with timestamps.
// This enables concurrent operations: if I add 'X' and you remove 'Y',
// both operations go through (per-element LWW conflict resolution).
//
// This is fundamentally different from the classic useSet which replaces
// the whole set — there, concurrent edits would clobber each other.
//

'use client';

import { useRef, useCallback } from 'react';

import { getActorId } from '../../../crdt/actorId';
import { useFieldSelector, dispatchFieldEvent } from '../../redux';
import { assertValidField } from '../../fields';
import type { FieldInfo, RuntimeProps, StateKey } from '../../../types';

// Re-export constructor from cycle-safe module
export { setField } from './setConstructor';

const EMPTY_SET: Set<string> = new Set();

/**
 * CRDT useSet — dispatches individual SET_ADD / SET_REMOVE events.
 *
 * Unlike the classic version (which replaces the whole set via useFieldState),
 * this dispatches per-element events with LWW timestamps. Concurrent
 * operations on different elements never conflict.
 *
 * @example
 *   const visited = useSet(props, fields.visited);
 *   visited.add('SVD');   // dispatches SET_ADD with timestamp
 *   visited.del('PCA');   // dispatches SET_REMOVE with timestamp
 */
export function useSet(
  props: RuntimeProps,
  field: FieldInfo,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {}
) {
  if (field.kind && field.kind !== 'set') {
    throw new Error(
      `[useSet] Field '${field.name}' has kind '${field.kind}', expected 'set'. ` +
      `Use the accessor matching the field type.`
    );
  }
  assertValidField(field);

  const values: Set<string> = useFieldSelector(props, field, { stateKey, tag, fallback: EMPTY_SET });

  const ref = useRef({ props, field, stateKey, tag });
  ref.current = { props, field, stateKey, tag };

  const add = useCallback((element: string) => {
    const { props, field, stateKey, tag } = ref.current;
    dispatchFieldEvent(props, field, 'SET_ADD', {
      field: field.name,
      element,
      ts: Date.now(),
      actor: getActorId(),
    }, { stateKey, tag });
  }, []);

  const del = useCallback((element: string) => {
    const { props, field, stateKey, tag } = ref.current;
    dispatchFieldEvent(props, field, 'SET_REMOVE', {
      field: field.name,
      element,
      ts: Date.now(),
      actor: getActorId(),
    }, { stateKey, tag });
  }, []);

  return {
    values,
    size: values.size,
    has: (element: string) => values.has(element),
    add,
    del,
  };
}
