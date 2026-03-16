// lib/state/fieldTypes/classic/useSet.ts
//
// Classic useSet — thin wrapper around useFieldState.
//
// Whole-set replacement: add('X') constructs a new Set and replaces
// the entire value. No per-element events, no timestamps. Concurrent
// edits clobber each other (last writer wins on the whole set).
//
// Separated from set.ts to break the circular dependency:
// fieldTypes/index → redux → fields → fieldTypes.
//

'use client';

import { useCallback, useRef } from 'react';

import { useFieldState } from '../../redux';
import { assertValidField } from '../../fields';
import type { FieldInfo, RuntimeProps, ReduxStateKey } from '../../../types';

/**
 * Classic useSet — thin wrapper around useFieldState.
 */
export function useSet(
  props: RuntimeProps,
  field: FieldInfo,
  { reduxKey, tag }: { reduxKey?: ReduxStateKey; tag?: string } = {}
) {
  if (field.kind && field.kind !== 'set') {
    throw new Error(
      `[useSet] Field '${field.name}' has kind '${field.kind}', expected 'set'. ` +
      `Use the accessor matching the field type.`
    );
  }
  assertValidField(field);

  const [value, setValue] = useFieldState(props, field, new Set(), { reduxKey, tag });
  const values: Set<string> = value instanceof Set ? value : new Set();

  const ref = useRef(values);
  ref.current = values;

  const add = useCallback((element: string) => {
    const current = ref.current;
    if (!current.has(element)) {
      setValue(new Set([...current, element]));
    }
  }, [setValue]);

  const del = useCallback((element: string) => {
    const current = ref.current;
    if (current.has(element)) {
      const next = new Set(current);
      next.delete(element);
      setValue(next);
    }
  }, [setValue]);

  return {
    values,
    size: values.size,
    has: (element: string) => values.has(element),
    add,
    del,
  };
}
