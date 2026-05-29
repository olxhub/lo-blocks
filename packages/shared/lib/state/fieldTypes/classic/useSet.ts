// lib/state/fieldTypes/classic/useSet.ts
//
// Classic useSet — thin wrapper around useFieldState.
//
// Whole-set replacement: add('X') constructs a new array and replaces
// the entire value. No per-element events, no timestamps. Concurrent
// edits clobber each other (last writer wins on the whole set).
//
// Storage: plain JSON array in Redux (e.g., ['SVD', 'PCA']).
// Consumer API: Set<string> for convenience.
// The hook converts between the two at the boundary.
//
// Separated from set.ts to break the circular dependency:
// fieldTypes/index → redux → fields → fieldTypes.
//

'use client';

import { useCallback, useRef } from 'react';

import { useFieldState } from '../../redux';
import { assertValidField } from '../../fields';
import type { FieldInfo, RuntimeProps, StateKey } from '../../../types';

/** Convert whatever is in Redux to a Set<string>. */
function toSet(raw: any): Set<string> {
  if (Array.isArray(raw)) return new Set(raw);
  return new Set();
}

/**
 * Classic useSet — thin wrapper around useFieldState.
 *
 * Stores an array in Redux, exposes a Set API to consumers.
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

  const [raw, setRaw] = useFieldState(props, field, [], { stateKey, tag });
  const values = toSet(raw);

  const ref = useRef(values);
  ref.current = values;

  const add = useCallback((element: string) => {
    const current = ref.current;
    if (!current.has(element)) {
      ref.current = new Set([...current, element]);
      setRaw([...ref.current]);
    }
  }, [setRaw]);

  const del = useCallback((element: string) => {
    const current = ref.current;
    if (current.has(element)) {
      ref.current = new Set([...current].filter(e => e !== element));
      setRaw([...ref.current]);
    }
  }, [setRaw]);

  return {
    values,
    size: values.size,
    has: (element: string) => values.has(element),
    add,
    del,
  };
}
