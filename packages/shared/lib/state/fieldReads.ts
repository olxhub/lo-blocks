// packages/shared/lib/state/fieldReads.ts
//
// Field READS for Learning Observer state — the pure (no React) core of the
// state layer. redux.ts re-exports everything here; the headless grading path
// imports straight from this module so it never pulls a 'use client' file.
//
// THE THREE READ LEVELS (example: TextArea's `value`, backed by a docField):
//
//   level | selector (state, …)  | non-hook getter | returns                       | example
//   ------+----------------------+-----------------+-------------------------------+----------------------------
//     1   | rawFieldSelector     | getRawField     | storage representation        | JsonUpdate structs
//     2   | decodedFieldSelector | getDecodedField | field.read applied            | "hello world"
//     3   | fieldSelector        | getField        | OBSERVABLE: getter ?? decoded | "hello world" or kids-fallback
//
// One meaning per name: a read's level is chosen at the call site BY FUNCTION
// NAME, never by an option. Qualifier monotonicity: each level strictly strips
// interpretation from the one below it — 2 is 1 plus field.read, 3 is 2 plus
// the blueprint getter. fieldSelector is identical for own-block and
// cross-block reads (no stateKey-presence routing).
//
// LAYERING RULE: level 3 is the read for everything block-facing — components,
// the state language, orchestrators, actions, block logic (advance/locals),
// and CROSS-FIELD reads inside getter bodies (they compose through the other
// field's getter; genuine cycles throw via the re-entrancy guard). Levels 1–2
// should be RARE: getter self-reads (a getter reading its own backing field),
// write-path diffing (updateField's oldRaw), persistence/sync/encode
// internals, useInputField's binding read, and grading's stored-leaf
// internals (readStoredGradingState/readGradingField).
//
// Value brands enforce the levels at compile time: level 1 returns
// RawFieldValue<T>, level 3 returns ObservableValue<T>, level 2 the plain
// interior — flow diagram and cast doctrine in lib/types/fieldValues.ts.
//
// Getters (blueprint `selectors`) come in three declaration forms — see
// FieldSelector in lib/types/core.ts. Reads obey the pipeline law everywhere:
// subscribe cheap → gate on equality → interpret after the gate
// (useFieldSelector's docstring in fieldHooks.ts has the mechanics; do not
// "simplify" it to wrap fieldSelector).

import { scopedStateKeyForBlock, leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { commonFields } from './commonFields';
import { scopes } from '../state/scopes';
import { FieldInfo, FieldSelector, DefinitionKey, StateKey, RuntimeProps, OlxJson, LoBlock } from '../types';
import { asObservableValue } from '../types/fieldValues';
import type { RawFieldValue, ObservableValue } from '../types/fieldValues';
import { assertValidField } from './fields';
import { staticEntry, blueprintFor } from '../blocks/staticDom';
import { getReduxStoreInstance } from './store';
import { evaluateFieldSelector, selectorReturnsBlockData, staticTargetProps } from './blockData';

// Options for fieldSelector and friends.
// stateKey overrides which component's state to access (cross-component access).
// If omitted, the component's own key is resolved from props.
// No option changes a read's LEVEL — that is chosen by function name
// (rawFieldSelector / decodedFieldSelector / fieldSelector).
export interface SelectorOptions<T> {
  stateKey?: StateKey;
  tag?: string;
  fallback?: T;
  /** Caller-side equality override. Prefer declared equality where it
   *  exists: field.equality (level-1 representations) or a getter's
   *  declared equality (level-3 results). */
  equalityFn?: (a: T, b: T) => boolean;
}

// The three read levels — table, layering rule, and monotonicity invariant in
// the module header above. All three accept BaselineProps or RuntimeProps:
// component/storage scope needs id/nodeInfo for ID resolution, system scope
// needs only the field.

/**
 * Level 1 — the raw backing store for a field: no field.read, no blueprint
 * getter. This is the storage representation (a docField's JsonUpdate, a setField's
 * SetDoc). Write-path diffing and selector implementations that own the store
 * read here.
 */
export const rawFieldSelector = <T>(
  state,
  props,
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): RawFieldValue<T> => {
  const { stateKey, tag: optTag, fallback } = options;
  const { scope } = field;
  const scopedState = state?.application_state?.[scope];
  const bucket = (() => {
    switch (scope) {
      case scopes.componentSetting:
        return scopedState?.[optTag ?? props?.loBlock?.name];
      case scopes.system:
        return scopedState;
      case scopes.storage:
      case scopes.component:
        return scopedState?.[stateKey ?? scopedStateKeyForBlock(props)];
      default:
        throw new Error('Unrecognized scope');
    }
  })();
  const value: T | undefined = bucket?.[field.name];
  // The level-1 accessor is the boundary where untyped store contents — and
  // the caller's fallback, substituting for absent storage — acquire the raw
  // brand (see the cast doctrine in types/fieldValues.ts).
  return (value === undefined ? fallback : value) as RawFieldValue<T>;
};

/**
 * Level 2 — the decoded field value: field.read applied to the raw store, no
 * blueprint getter. Selector implementations reading their own backing field,
 * grading state reads, and write-path display reads live here — they want the
 * value, not the representation.
 */
export const decodedFieldSelector = <T>(
  state,
  props,
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): T => {
  const raw = rawFieldSelector(state, props, field, options);
  return decodeField(field, raw) as T;
};

/**
 * Level 3 — the OBSERVABLE value of a field: a block's blueprint getter
 * (`selectors[name]`) when it declares one, else the decoded store. Identical
 * for own-block and cross-block reads (no stateKey-presence routing). This is
 * the level components, the state language, and orchestrators read.
 */
export const fieldSelector = <T>(
  state,
  props,
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): ObservableValue<T> => {
  // Blueprint getter — the getter half of the getter/setter pattern
  // (selectValue generalized): a block's observable field may be COMPUTED
  // (fallbacks, grading's mode dispatch, coercion, purely-derived
  // Navigator/metagrader fields). A getter masks only its own backing field,
  // so a getter body reads ITS OWN backing field through level 1/2 (a level-3
  // self-read recurses; the guard in evalGetter throws) — but reads of OTHER
  // fields go through fieldSelector, composing through their getters if any.
  // Getter authors return plain values; the exits below are the stamp points
  // where results become ObservableValue (types/fieldValues.ts doctrine).
  if (field.scope === scopes.component) {
    const resolved = resolveDecl(state, props, options.stateKey, field.name, 'selectors');
    if (resolved) {
      return asObservableValue(evalGetter(state, resolved, field.name, options.fallback)) as ObservableValue<T>;
    }
  }
  return asObservableValue(decodedFieldSelector(state, props, field, options));
};

/**
 * Multi-field level-3 read: each field's observable value, keyed by
 * field.name. The plural spelling of fieldSelector for getter bodies and
 * block logic that read several sibling fields at once. One shared
 * fallback — fields needing distinct fallbacks read individually.
 */
export function selectFields(
  state: any,
  props: any,
  fieldList: FieldInfo[],
  options: { fallback?: any; stateKey?: StateKey; tag?: string } = {},
): Record<string, ObservableValue<any>> {
  return Object.fromEntries(
    fieldList.map((f) => [f.name, fieldSelector(state, props, f, options)]),
  );
}

/** A resolved blueprint declaration — a `selectors` getter (any of the three
 *  FieldSelector forms — never pre-bound, so callers can split the pipelined
 *  form around a gate) or a `setters` setter — plus the target props/key to
 *  evaluate it with. */
type ResolvedDecl<D> = { decl: D; targetProps: RuntimeProps; stateKey: StateKey };

/** The single static-DOM resolution behind every cross-block read and write. */
export type ResolvedTarget = { node: OlxJson; loBlock: LoBlock; targetProps: RuntimeProps };

/**
 * Resolve the content node, blueprint, and TARGET props a StateKey addresses.
 * Built on the staticDom primitives (staticEntry + blueprintFor) with
 * targetProps from staticTargetProps — the dynamic (rendered) DOM is NEVER
 * consulted, so a cross-block read/write means the same thing whether or not
 * the target is mounted (the doctrine in the grading pipeline headers).
 *
 * Null when the key is outside the content grammar (app-level buffers, test
 * fixtures — no blueprint, plain stored access) or the content isn't loaded.
 */
export function resolveTarget(state: any, props: any, stateKey: StateKey): ResolvedTarget | null {
  if (!props?.runtime) return null;
  let defKey: DefinitionKey;
  try {
    defKey = leafDefinitionKeyFromStateKey(stateKey);
  } catch {
    return null;
  }
  const node = staticEntry(state, props, defKey);
  if (!node) return null;
  const loBlock = blueprintFor(props, node);
  if (!loBlock) return null;
  return { node, loBlock, targetProps: staticTargetProps(props.runtime, stateKey, defKey, node, loBlock) };
}

/**
 * Resolve a blueprint declaration for a field — its `selectors` getter or its
 * `setters` setter — plus the props/key to call it with. Cross references (an
 * explicit stateKey) resolve against the addressed block via resolveTarget;
 * own references resolve straight off props.loBlock — cheaper, no content
 * lookup. Null when the block declares nothing of that kind for the field (a
 * plain stored field).
 */
export function resolveDecl<K extends 'selectors' | 'setters'>(
  state: any, props: any, stateKey: StateKey | undefined, fieldName: string, kind: K,
): ResolvedDecl<NonNullable<LoBlock[K]>[string]> | null {
  type D = NonNullable<LoBlock[K]>[string];
  if (stateKey) {
    const target = resolveTarget(state, props, stateKey);
    const decl = target?.loBlock[kind]?.[fieldName] as D | undefined;
    if (!decl) return null;
    return { decl, targetProps: target!.targetProps, stateKey };
  }
  const decl = props?.loBlock?.[kind]?.[fieldName] as D | undefined;
  if (!decl) return null;
  return { decl, targetProps: props as RuntimeProps, stateKey: scopedStateKeyForBlock(props) };
}

// A blueprint declaration (getter or setter) that re-enters itself through
// its own level-3 read/write recurses forever; the guard throws instead.
// Keyed `${stateKey}|${fieldName}`, always on (cheap). The getter guard wraps
// ALL declaration forms (a pipelined getter's deps take state and could
// re-enter just as a bare fn can; compute sees only dep values).
function makeReentrancyGuard(kind: string, advice: string) {
  const inFlight = new Set<string>();
  return <R>(stateKey: StateKey, fieldName: string, run: () => R): R => {
    const guardKey = `${stateKey}|${fieldName}`;
    if (inFlight.has(guardKey)) {
      throw new Error(`${kind} for ${fieldName} on ${stateKey} re-enters itself — ${advice}`);
    }
    inFlight.add(guardKey);
    try {
      return run();
    } finally {
      inFlight.delete(guardKey);
    }
  };
}

export const withGetterGuard = makeReentrancyGuard(
  'selector', 'read the backing store with decodedFieldSelector/rawFieldSelector');

export function evalGetter(
  state: any,
  resolved: ResolvedDecl<FieldSelector>,
  fieldName: string,
  fallback: any,
) {
  const { decl, targetProps, stateKey } = resolved;
  return withGetterGuard(stateKey, fieldName, () => {
    const raw = evaluateFieldSelector(decl, state, targetProps, stateKey);
    // withStatus selectors return BlockDataResult — unwrap to the value.
    const value = selectorReturnsBlockData(decl) ? (raw as any)?.value : raw;
    return value === undefined ? fallback : value;
  });
}

// The setter guard mirrors the getter guard. Setter bodies write through
// updateField, which never consults setters, so normal fan-out can't trip
// it — re-entry means a setter called setField on its own field.
export const withSetterGuard = makeReentrancyGuard(
  'setter', 'write the backing store with updateField');

// Non-hook store conveniences — one per read level, mirroring the selectors.
// For actions, graders, and callbacks that read the singleton store without
// subscribing. Hook callers use useFieldSelector.

/** Level 1 (raw store) for non-hook callers. */
export const getRawField = <T>(
  props: any,
  field: FieldInfo,
  options: SelectorOptions<any> = {}
): RawFieldValue<T> => {
  assertValidField(field);
  const state = getReduxStoreInstance().getState();
  return rawFieldSelector(state, props, field, options);
};

/** Level 2 (decoded store) for non-hook callers. */
export const getDecodedField = <T>(
  props: any,
  field: FieldInfo,
  options: SelectorOptions<any> = {}
): T => {
  assertValidField(field);
  const state = getReduxStoreInstance().getState();
  return decodedFieldSelector(state, props, field, options);
};

/** Level 3 (observable value) for non-hook callers. */
export const getField = <T>(
  props: any,
  field: FieldInfo,
  options: SelectorOptions<any> = {}
): ObservableValue<T> => {
  assertValidField(field);
  const state = getReduxStoreInstance().getState();
  return fieldSelector(state, props, field, options);
};

/**
 * Decode a raw Redux value into its consumer-facing form via field.read.
 * No-op if the field has no read transform (stateFields store values bare).
 *
 * Example: docField stores a JsonUpdate in Redux; decodeField produces a string.
 *
 * Use this for non-hook callers that need materialized values from fieldSelector.
 * Hook callers get decoding automatically via useFieldSelector.
 *
 * Naming: "decode" because it transforms raw storage → consumer value.
 * The inverse (consumer → storage events) is field.write, conceptually "encode."
 *
 * The RawFieldValue brand (types/fieldValues.ts) enforces the input side:
 * only level-1 reads produce values this function accepts.
 */
export function decodeField(field: FieldInfo, raw: RawFieldValue): any {
  // Absence passes through: read decodes PRESENT values. Running read on
  // undefined would manufacture a value from nothing (docField's
  // read(undefined) → ''), swallowing the caller's fallback — which broke
  // "no state yet → use initial text" logic (TextArea/Mermaid) the moment
  // CRDT fields became the default.
  if (raw === undefined) return undefined;
  return field.read ? field.read(raw) : raw;
}

/**
 * Get a human/LLM-readable string from a raw field value.
 * Uses field.display if defined, otherwise falls back to stringifying the read value.
 */
export function displayField(field: FieldInfo, raw: RawFieldValue): string {
  if (field.display) return field.display(raw);
  const value = decodeField(field, raw);
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Look up a field DEFINITION (FieldInfo) on the block a StateKey addresses.
 * Selector-backed fields with no stored backing (metagraders' grading
 * quartet) resolve to the common field shape — reads then route through the
 * blueprint selector in fieldSelector.
 *
 * @example
 *   const targetStateKey = stateKeyForGlobalRef(target);
 *   const field = componentFieldByStateKey(props, targetStateKey, 'value');
 *   const val = useFieldSelector(props, field, { stateKey: targetStateKey });
 */
export function componentFieldByStateKey(props: RuntimeProps, stateKey: StateKey, fieldName: string): FieldInfo {
  const resolved = resolveTarget(props.runtime.store.getState(), props, stateKey);
  if (!resolved) {
    throw new Error(`Could not find component "${leafDefinitionKeyFromStateKey(stateKey)}". `
      + 'Check that the id exists in your OLX and is spelled correctly, and that its block type is registered.');
  }
  const { node, loBlock } = resolved;
  const field = loBlock.fields?.[fieldName]
    ?? (loBlock.selectors?.[fieldName] ? (commonFields as Record<string, FieldInfo>)[fieldName] : undefined);
  if (!field) {
    const availableFields = [...Object.keys(loBlock.fields || {}), ...Object.keys(loBlock.selectors || {})];
    throw new Error(`<${node.tag} id="${leafDefinitionKeyFromStateKey(stateKey)}"> has no "${fieldName}" field. `
      + `Available fields: ${availableFields.join(', ') || 'none'}`);
  }
  return field;
}
