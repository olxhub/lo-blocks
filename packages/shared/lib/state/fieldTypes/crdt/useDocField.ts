// lib/state/fieldTypes/crdt/useDocField.ts
//
// CRDT useDocField — thin wrapper around useFieldState.
//
// docField.write already computes splice deltas from old text → new text
// and produces SPLICE_INPUT events. docField.read materializes RgaDoc → string.
// useFieldState handles both generically, so useDocField is just a
// thin wrapper that validates the field kind.
//

'use client';

import { useFieldState } from '../../redux';
import { assertValidField } from '../../fields';
import type { FieldInfo, RuntimeProps, ReduxStateKey } from '../../../types';

/**
 * CRDT useDocField — returns [value, setValue] via useFieldState.
 *
 * Under the hood, setValue(newText) calls docField.write which computes
 * a splice delta and dispatches SPLICE_INPUT. The field-level reducer
 * applies the splice to the RgaDoc.
 */
export function useDocField(
  props: RuntimeProps,
  field: FieldInfo,
  fallback = '',
  { reduxKey, tag }: { reduxKey?: ReduxStateKey; tag?: string } = {}
) {
  if (field.kind && field.kind !== 'doc') {
    throw new Error(
      `[useDocField] Field '${field.name}' has kind '${field.kind}', expected 'doc'. ` +
      `Use the accessor matching the field type.`
    );
  }
  assertValidField(field);
  return useFieldState(props, field, fallback, { reduxKey, tag });
}
