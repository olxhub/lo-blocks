// packages/shared/lib/types/fieldValues.ts
//
// Value-level brands for the three field-read levels (lib/state/redux.ts).
// Two brands bracket an unbranded interior:
//
//   RawFieldValue<T> --[field.read]--> T (internal) --[level-3 gate, stamped]--> ObservableValue<T>
//      storage                          the black box                             exported / final
//
// RawFieldValue is the storage representation (a JsonUpdate, a SetDoc, an LWW
// cell). ObservableValue is a block's FINAL, exportable value: what level 3
// returns after the blueprint getter (or getterless decode) has run. The
// unbranded middle is deliberate: if you hold a plain T from a field read,
// you are inside someone's black box and it is not yours to export — pass it
// to a sink and the sink's ObservableValue type will refuse it.
//
// Finality is route-based: a value acquires ObservableValue ONLY by exiting a
// level-3 read. decodedFieldSelector always returns plain T — even for
// unmasked fields — so a masked field's decoded value cannot leak out as
// final; nothing that touches it can produce the brand.
//
// Accepted looseness (documented, not fixed): an unmasked field read via
// level 2 inside its own block is unbranded even though semantically final.
// The upgrade path is per-block FieldInfo generics carrying maskedness —
// deliberately deferred.
//
// Cast doctrine — anywhere else, either cast is a review flag (greppable):
// - `as RawFieldValue` is legal ONLY at: reducer fold output, persistence
//   load, test fixtures — plus the level-1 accessor implementations
//   (rawFieldSelector/getRawField), the boundary where untyped store
//   contents (and the caller's fallback, substituting for absent storage)
//   acquire the brand.
// - `asObservableValue` (the stamp helper below) is legal ONLY inside the
//   level-3 read implementations: fieldSelector's return, useFieldSelector's
//   post-gate return, getField, and the getter-invocation/stamp path
//   (valueSelector and the DSL materializer's bucket-view values). Getter
//   AUTHORS return plain T; the framework stamps on export.

import { Branded } from './brand';

/** Level-1 storage representation. Produced by rawFieldSelector/getRawField;
 *  consumed by field.read / field.write(oldRaw) / decodeField. */
export type RawFieldValue<T = unknown> = Branded<T, 'RawFieldValue'>;

/** Level-3 final value — a block's observable state, safe to export.
 *  Produced only by the level-3 reads; demanded by finality sinks
 *  (GraderInput.value, DSL context values, valueSelector, copies,
 *  lastSubmission captures). */
export type ObservableValue<T = unknown> = Branded<T, 'ObservableValue'>;

/** Stamp a value as observable/final. See the cast doctrine above: legal
 *  only inside the level-3 read implementations — never in block code. */
export function asObservableValue<T>(value: T): ObservableValue<T> {
  return value as ObservableValue<T>;
}
