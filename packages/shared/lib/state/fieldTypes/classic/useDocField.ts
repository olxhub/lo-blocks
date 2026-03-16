// lib/state/fieldTypes/classic/useDocField.ts
//
// Classic useDocField — thin wrapper around useFieldState.
//
// In classic mode, a "document" is just a string. No RGA, no splice
// deltas. useFieldState handles read/write generically.
//

'use client';

import { useFieldState } from '../../redux';
import { assertValidField } from '../../fields';
import type { FieldInfo, RuntimeProps, ReduxStateKey } from '../../../types';

/**
 * Classic useDocField — returns [value, setValue] via useFieldState.
 */
export function useDocField(
  props: RuntimeProps,
  field: FieldInfo,
  fallback = '',
  { reduxKey, tag }: { reduxKey?: ReduxStateKey; tag?: string } = {}
) {
  assertValidField(field);
  return useFieldState(props, field, fallback, { reduxKey, tag });
}
