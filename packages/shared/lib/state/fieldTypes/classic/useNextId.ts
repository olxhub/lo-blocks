// packages/shared/lib/state/fieldTypes/classic/useNextId.ts
//
// Hook for allocating unique IDs from an idField.
//
// Returns a stable callback `nextId()` that increments the counter and
// returns the allocated ID string. Works identically for classic and CRDT
// — all differentiation is in field.write and field.reduce.
//
// Separated from id.ts to break the circular dependency:
// fieldTypes/index → redux → fields → fieldTypes.
//

'use client';

import { useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';

import { rawFieldSelector, dispatchFieldEvent } from '../../redux';
import { assertValidField } from '../../fields';
import type { FieldInfo, RuntimeProps, StateKey } from '../../../types';

/**
 * Hook that returns a stable `nextId()` callback for allocating unique IDs.
 *
 * The callback increments the idField's counter and returns the allocated ID
 * string (e.g., "0", "1" for classic; "a7b3_0", "a7b3_1" for CRDT).
 *
 * Call `nextId()` from event handlers, not from render. The returned ID is
 * suitable for use as a scope marker.
 *
 * @param props - Component props
 * @param field - An idField (kind: 'id')
 * @param opts - Optional stateKey/tag overrides
 * @returns A stable `() => string` callback
 */
export function useNextId(
  props: RuntimeProps,
  field: FieldInfo,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {}
): () => string {
  if (field.kind && field.kind !== 'id') {
    throw new Error(
      `[useNextId] Field '${field.name}' has kind '${field.kind}', expected 'id'. ` +
      `Use the accessor matching the field type.`
    );
  }
  assertValidField(field);

  // ID writers operate on the storage representation. In particular, the
  // CRDT idField stores a per-actor counter map but decodes to a total count;
  // feeding that decoded number back into write() restarts allocation at 0.
  const raw = useSelector((state: any) =>
    rawFieldSelector(state, props, field, { stateKey, tag })
  );

  // Ref for optimistic rapid-fire calls within the same render cycle
  const ref = useRef({ raw, props, field, stateKey, tag });
  ref.current = { raw, props, field, stateKey, tag };

  const nextId = useCallback((): string => {
    const { raw, props, field, stateKey, tag } = ref.current;
    if (!field.write) {
      throw new Error(`[useNextId] Field '${field.name}' has no write method — is it an idField?`);
    }

    const results = field.write(raw, null);
    if (results.length === 0) {
      throw new Error(`[useNextId] Field '${field.name}' write produced no events`);
    }

    const { event, payload } = results[0];
    dispatchFieldEvent(props, field, event, payload, { stateKey, tag });

    // Optimistic update: advance the raw value for rapid consecutive calls
    // so the next call within the same render cycle gets the right counter.
    const patch = field.reduce?.({ [field.name]: raw }, payload, field.name);
    ref.current.raw = patch?.[field.name] ?? payload[field.name] ?? raw;

    return payload.allocatedId;
  }, []);

  return nextId;
}
