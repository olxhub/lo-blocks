// packages/shared/lib/state/fieldWrites.ts
//
// Field WRITES — the pure (no React) write half of the state layer, mirroring
// fieldReads by function name: setField is the OBSERVABLE write (blueprint
// setter ?? updateField); updateField is the storage write (field.write /
// encoder → dispatchFieldEvent). Both fail fast on purely-derived fields.

import * as lo_event from 'lo_event';

import { scopedStateKeyForBlock } from '../types/id-grammar';
import { scopes } from '../state/scopes';
import { FieldInfo, BaselineProps, RuntimeProps, StateKey, LoBlock } from '../types';
import { assertValidField } from './fields';
import { getReduxStoreInstance } from './store';
import { writeEncoded } from './encode';
import { rawFieldSelector, resolveTarget, resolveDecl, withSetterGuard } from './fieldReads';

const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import

/**
 * Fail fast on writes to purely-derived fields: a getter masks the name and
 * the block declares no same-name stored field, so a raw write lands in a
 * bucket key no read can ever observe — always a bug. Self-masked fields
 * (declared field + getter — TextArea, every input) pass untouched.
 */
function assertWritableField(loBlock: LoBlock | undefined | null, fieldName: string): void {
  if (!loBlock) return;
  if (loBlock.selectors?.[fieldName] && !loBlock.fields?.[fieldName]) {
    throw new Error(
      `field '${fieldName}' on ${loBlock.name} is derived; there is nothing `
      + `to write. Declare setters.${fieldName} or write the backing fields.`,
    );
  }
}

/**
 * Dispatch a single event with infrastructure fields (scope, id, tag) resolved.
 *
 * Shared by updateField (which may produce multiple events via field.write)
 * and vertical-slice hooks like useSet (which dispatch individual events).
 *
 * Eliminates the duplicated scope/id/tag/logEvent resolution that was in
 * both updateField and useSet.
 */
export function dispatchFieldEvent(
  props: BaselineProps | null,
  field: FieldInfo,
  eventType: string,
  payload: Record<string, any>,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {}
) {
  const scope = field.scope;
  const resolvedKey = (scope === scopes.component || scope === scopes.storage)
    ? (stateKey ?? scopedStateKeyForBlock(props as RuntimeProps))
    : undefined;
  const resolvedTag = tag ?? (props as RuntimeProps)?.loBlock?.name;
  const logEvent = props ? props.runtime.logEvent : lo_event.logEvent;

  logEvent(eventType, {
    scope,
    ...(scope === scopes.component || scope === scopes.storage ? { id: resolvedKey } : {}),
    ...(scope === scopes.componentSetting ? { tag: resolvedTag } : {}),
    // Level stamp: SELF-DESCRIPTION ONLY — replay can tell whose truth
    // an event was without consulting content. The server does NOT trust
    // it: routing derives the level from content + registry
    // (sync/fieldLevels.ts), so a forged stamp cannot reach shared
    // state. (Wire vocabulary predates the level axis: 'shared' =
    // events-relayed, 'server' = folded-delivery.)
    ...(field.level && field.level !== 'user'
      ? { authority: field.delivery === 'folded' ? 'server' : 'shared' }
      : {}),
    ...payload,
  });
}

/**
 * The OBSERVABLE write — setField is to updateField what fieldSelector is to
 * decodedFieldSelector: blueprint setter ?? storage write. A block's setter
 * (LoBlock.setters — see FieldSetterFn in types/core.ts) translates
 * assignment into events on its backing fields; blocks without one fall
 * through to updateField unchanged. Purely-derived fields with no setter
 * reject the write (updateField's fail-fast guard).
 *
 * This is the block-facing write for OTHER blocks' fields (actions, the DSL
 * later). updateField remains correct for a block writing its own declared
 * backing fields and for bindings/storage code.
 */
export function setField(
  props: BaselineProps | null,
  field: FieldInfo,
  value: any,
  { stateKey, tag, extras }: { stateKey?: StateKey; tag?: string; extras?: Record<string, any> } = {}
): void {
  assertValidField(field);
  if (field.scope === scopes.component) {
    // Cross-target setter resolution needs state for the content lookup;
    // own-block resolution reads props.loBlock directly.
    const state = stateKey
      ? (props?.runtime?.store ?? getReduxStoreInstance()).getState()
      : null;
    const resolved = resolveDecl(state, props, stateKey, field.name, 'setters');
    if (resolved) {
      withSetterGuard(resolved.stateKey, field.name, () =>
        resolved.decl(value, resolved.targetProps, resolved.stateKey));
      return;
    }
  }
  updateField(props, field, value, { stateKey, tag, extras });
}

// Accepts BaselineProps (system scope) or RuntimeProps (component/storage scope).
// Polymorphic: branches on field.scope to access different properties.
// TODO: Consider splitting into updateSystemField / updateComponentField for type safety.
export function updateField(
  props: BaselineProps | null,
  field: FieldInfo,
  newValue,
  // extras: sibling FIELD values riding this field's event — one envelope key
  // on the wire (`extras: { selection: {...} }`), folded into the same bucket
  // by the reducer. Each entry names a declared field (useInputField's
  // selection is the canonical case). Never spread into the payload.
  { stateKey, tag, extras }: { stateKey?: StateKey; tag?: string; extras?: Record<string, any> } = {}
) {
  assertValidField(field);

  // Fail fast on writes to purely-derived fields (see assertWritableField).
  // Cross writes resolve the target blueprint when the runtime is available;
  // null-props callers (app-level buffers) have no blueprint to check.
  if (field.scope === scopes.component) {
    const target = stateKey
      ? (props?.runtime?.store
        ? resolveTarget(props.runtime.store.getState(), props, stateKey)?.loBlock
        : undefined)
      : (props as RuntimeProps | null)?.loBlock;
    assertWritableField(target, field.name);
  }

  // Schema validation runs before write — coerce/validate regardless of field type.
  if (field.schema) {
    newValue = field.schema.parse(newValue);
  }

  // Encoded fields (the encode axis — lib/state/encode.ts): local Redux
  // updates per sample, the wire sees one aggregate event per quiet
  // period. Replaces the write/dispatch path entirely. LWW-only: the
  // aggregate envelope ({startTs, samples}) is expanded by lwwReduce;
  // doc/set/log reducers would fold it as garbage.
  if (field.encoder) {
    if (field.kind && field.kind !== 'state') {
      throw new Error(`Field '${field.name}': encoder is unsupported on kind `
        + `'${field.kind}' — encoders compose with LWW stateFields only`);
    }
    writeEncoded(props, field, newValue, { stateKey, tag });
    return;
  }

  // Per-field LEVELS within one interaction: extras (useInputField's
  // selection tracking) are the CALLER's cursor — level user — even when
  // the VALUE is level everyone. Riding the value event would put one
  // shared cursor in the everyone-bucket for all editors to fight over;
  // instead they ship as their own unstamped (level-user) event, landing
  // in the caller's copy of the same bucket key. Client Redux merges both
  // into one local bucket, so readers are oblivious.
  if (extras && field.level && field.level !== 'user') {
    const logEvent = props ? (props as any).runtime.logEvent : lo_event.logEvent;
    logEvent(UPDATE_INPUT, {
      scope: field.scope,
      id: stateKey ?? scopedStateKeyForBlock(props as RuntimeProps),
      extras,
    });
    extras = undefined;
  }

  if (field.write) {
    // Field knows how to produce its own events (e.g., docField computes splices)
    const store = props?.runtime?.store ?? getReduxStoreInstance();
    const oldRaw = rawFieldSelector(store.getState(), props, field, { stateKey, tag });
    const results = field.write(oldRaw, newValue);
    // The extras envelope rides only the LAST event — it represents final
    // cursor position, not per-event state.
    for (let i = 0; i < results.length; i++) {
      const { event, payload } = results[i];
      const last = i === results.length - 1;
      dispatchFieldEvent(props, field, event,
        { ...payload, ...(last && extras ? { extras } : {}) }, { stateKey, tag });
    }
  } else {
    // Default: single event with { [fieldName]: newValue }
    dispatchFieldEvent(props, field, field.event!,
      { [field.name]: newValue, ...(extras ? { extras } : {}) }, { stateKey, tag });
  }
}
