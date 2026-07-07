'use client';
// packages/shared/lib/state/fieldTypes/crdt/log.ts
//
// Log field dispatch helpers. The constructor is in logConstructor.ts
// (cycle-safe); these import redux.ts, so they're re-exported from
// state/index.ts after the fieldTypes/redux/fields cycle resolves.
//

import { dispatchFieldEvent } from '../../redux';
import { assertValidField } from '../../fields';
import { newLogStamp } from '../../../crdt/log';
import { getActorId } from '../../../crdt/actorId';
import type { FieldInfo, BaselineProps, StateKey } from '../../../types';

export { logField } from './logConstructor';

function assertLogField(field: FieldInfo, caller: string): void {
  if (field.kind && field.kind !== 'log') {
    throw new Error(
      `[${caller}] Field '${field.name}' has kind '${field.kind}', expected 'log'. ` +
      `Use the accessor matching the field type.`
    );
  }
  assertValidField(field);
}

/**
 * Append one item to a log field. Props may be null for non-component
 * surfaces (pass an explicit stateKey), matching updateField's contract.
 */
export function appendToLog(
  props: BaselineProps | null,
  field: FieldInfo,
  item: unknown,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {},
): void {
  assertLogField(field, 'appendToLog');
  dispatchFieldEvent(props, field, 'LOG_APPEND', {
    field: field.name,
    item,
    ...newLogStamp(),
  }, { stateKey, tag });
}

/**
 * Clear a log field — a LWW watermark, not deletion: concurrent appends
 * from other actors after the clear survive.
 */
export function clearLog(
  props: BaselineProps | null,
  field: FieldInfo,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {},
): void {
  assertLogField(field, 'clearLog');
  dispatchFieldEvent(props, field, 'LOG_CLEAR', {
    field: field.name,
    ts: Date.now(),
    actor: getActorId(),
  }, { stateKey, tag });
}
