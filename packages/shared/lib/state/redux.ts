// packages/shared/lib/state/redux.ts
//
// Redux integration layer — field reads and writes for Learning Observer state.
//
// THE THREE READ LEVELS (example: TextArea's `value`, backed by a docField):
//
//   level | selector (state, …)  | non-hook getter | returns                       | example
//   ------+----------------------+-----------------+-------------------------------+----------------------------
//     1   | rawFieldSelector     | getRawField     | storage representation        | RgaDoc ops
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
// (useFieldSelector's docstring has the mechanics; do not "simplify" it to
// wrap fieldSelector).
//
// WRITES mirror the reads, level chosen by function name:
//   setField    — OBSERVABLE write: blueprint setter ?? updateField. The
//                 block-facing write for OTHER blocks' fields (actions, DSL).
//   updateField — storage write: field.write/encoder → dispatchFieldEvent.
//                 Correct for a block writing its own declared backing fields
//                 and for bindings/storage code.
// Both fail fast on purely-derived fields (getter, no same-name stored field,
// no setter): a raw write there lands in a masked key no read can observe.

'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useStore, shallowEqual } from 'react-redux';

import * as lo_event from 'lo_event';

import { scopedStateKeyForBlock, scopePrefixOfStateKey, leafDefinitionKeyFromStateKey, stateKeyForGlobalRef, parseAnyStateRef, isNamespaceQualified, qualifyDefinitionRef } from '../types/id-grammar';
import { commonFields } from './commonFields';

import { scopes } from '../state/scopes';
import { FieldInfo, FieldSelector, FieldSetterFn, DefinitionRef, DefinitionKey, StateRef, StateKey, RuntimeProps, BaselineProps, OlxJson, LoBlock, BlockDataResult, BlockDataStatus, CurrentUser } from '../types';
import { asObservableValue } from '../types/fieldValues';
import type { RawFieldValue, ObservableValue } from '../types/fieldValues';
import { assertValidField } from './fields';
import { getUrlOverride, setUrlValue } from './urlFields';
import { selectBlock, selectBlockState } from './olxjson';
import { getDomNodeByStateKey, propsFromNode } from '../blocks/dynamicDom';
import { ensureBlock } from '../blocks/useOlxJson';
import { getReduxStoreInstance } from './store';
import { writeEncoded } from './encode';


const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import


// =============================================================================
// Selectors
// =============================================================================

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
 * getter. This is the storage representation (a docField's RgaDoc, a setField's
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
    const resolved = resolveGetter(state, props, options.stateKey, field.name);
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

/** A resolved getter: the raw DECLARATION (any of the three FieldSelector
 *  forms — never a pre-bound closure, so callers can split the pipelined
 *  form around a gate) plus the target props/key to evaluate it with. */
type ResolvedGetter = { decl: FieldSelector; targetProps: RuntimeProps; stateKey: StateKey };

/**
 * Resolve the blueprint getter for a field plus the props/key to call it with.
 * Cross reads (an explicit stateKey) resolve against the addressed block's
 * content node; own reads resolve straight off props.loBlock — cheaper, no
 * content lookup. Null when there is no getter (a plain stored field).
 */
function resolveGetter(state: any, props: any, stateKey: StateKey | undefined, fieldName: string): ResolvedGetter | null {
  if (stateKey) return blueprintSelectorFor(state, props, stateKey, fieldName);
  const decl = props?.loBlock?.selectors?.[fieldName];
  if (!decl) return null;
  return { decl, targetProps: props as RuntimeProps, stateKey: scopedStateKeyForBlock(props) };
}

/** A resolved setter: the declaration plus the target props/key. */
type ResolvedSetter = { decl: FieldSetterFn; targetProps: RuntimeProps; stateKey: StateKey };

/** resolveGetter's write twin: the blueprint setter for a field, own or cross. */
function resolveSetter(state: any, props: any, stateKey: StateKey | undefined, fieldName: string): ResolvedSetter | null {
  if (stateKey) {
    const target = targetBlueprint(state, props, stateKey);
    const decl = target?.loBlock.setters?.[fieldName];
    if (!decl) return null;
    return { decl, targetProps: propsForNode(props, stateKey, target!.node, target!.loBlock) as RuntimeProps, stateKey };
  }
  const decl = props?.loBlock?.setters?.[fieldName];
  if (!decl) return null;
  return { decl, targetProps: props as RuntimeProps, stateKey: scopedStateKeyForBlock(props) };
}

/**
 * Resolve the content node + blueprint a StateKey addresses. Null when the
 * key is outside the content grammar (app-level buffers, test fixtures —
 * no blueprint, plain stored access) or the content isn't loaded.
 */
function targetBlueprint(state: any, props: any, stateKey: StateKey): { node: OlxJson; loBlock: LoBlock } | null {
  const runtime = props?.runtime;
  if (!runtime) return null;
  let defKey: DefinitionKey;
  try {
    defKey = leafDefinitionKeyFromStateKey(stateKey);
  } catch {
    return null;
  }
  const node = selectBlock(state, runtime.olxJsonSources ?? ['content'], defKey, runtime.locale?.code);
  const loBlock = node ? runtime.blockRegistry[node.tag] : undefined;
  if (!node || !loBlock) return null;
  return { node, loBlock };
}

/**
 * Resolve the blueprint getter for a field on the block a StateKey addresses,
 * plus the target props/key to call it with. Null when the target block is
 * unknown (content loading) or declares no getter for the field.
 */
function blueprintSelectorFor(state: any, props: any, stateKey: StateKey, fieldName: string): ResolvedGetter | null {
  const target = targetBlueprint(state, props, stateKey);
  const decl = target?.loBlock.selectors?.[fieldName];
  if (!decl) return null;
  return { decl, targetProps: propsForNode(props, stateKey, target!.node, target!.loBlock) as RuntimeProps, stateKey };
}

// Getter evaluations in flight, keyed `${stateKey}|${fieldName}`. A getter that
// reads its own field back through level-3 fieldSelector recurses forever; we
// throw instead. Always on (cheap) — the fix is to read the backing store.
// The guard wraps ALL declaration forms (a pipelined getter's deps take state
// and could re-enter just as a bare fn can; compute sees only dep values).
const gettersInFlight = new Set<string>();

function withGetterGuard<R>(stateKey: StateKey, fieldName: string, run: () => R): R {
  const guardKey = `${stateKey}|${fieldName}`;
  if (gettersInFlight.has(guardKey)) {
    throw new Error(
      `selector for ${fieldName} on ${stateKey} re-enters itself — `
      + 'read the backing store with decodedFieldSelector/rawFieldSelector',
    );
  }
  gettersInFlight.add(guardKey);
  try {
    return run();
  } finally {
    gettersInFlight.delete(guardKey);
  }
}

function evalGetter(
  state: any,
  resolved: ResolvedGetter,
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
const settersInFlight = new Set<string>();

function withSetterGuard(stateKey: StateKey, fieldName: string, run: () => void): void {
  const guardKey = `${stateKey}|${fieldName}`;
  if (settersInFlight.has(guardKey)) {
    throw new Error(
      `setter for ${fieldName} on ${stateKey} re-enters itself — `
      + 'write the backing store with updateField',
    );
  }
  settersInFlight.add(guardKey);
  try {
    run();
  } finally {
    settersInFlight.delete(guardKey);
  }
}

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
 * Example: docField stores an RgaDoc in Redux; decodeField produces a string.
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
 * React hook wrapper around fieldSelector with automatic re-rendering.
 *
 * INVARIANT: field.read (decode) is applied AFTER the useSelector equality gate,
 * never inside it. useSelector compares raw Redux values; materialization happens
 * after. This prevents unnecessary re-renders: decode() may produce new objects
 * each call (e.g., new Set from an OR-Set CRDT), but the raw value is
 * reference-stable between dispatches.
 *
 * Critical for field types whose decode() produces new objects on every call
 * (e.g., setField decoding a SetDoc to a new Set). The raw value is
 * reference-stable between dispatches; decode runs only when raw changes.
 */
export const useFieldSelector = <T>(
  props: any,               // TODO: narrow when convenient
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): ObservableValue<T> => {
  // The hook implements level 3: getter-backed fields subscribe the getter
  // (own and cross alike — same semantics as fieldSelector); stored fields
  // subscribe level 1 (raw) for the equality gate and decode AFTER it.
  // decode() may mint a new object each call (a Set from an OR-Set CRDT); the
  // raw value is reference-stable between dispatches, so gating on it is what
  // keeps re-renders — and input cursors — stable. Do NOT "simplify" this to
  // wrap fieldSelector, which decodes before returning and would defeat the
  // gate.
  //
  // The getter DECLARATION (and hence its form) is static per blueprint; only
  // content-load timing is state-dependent, so it is resolved here at render.
  // The subscription re-resolves per dispatch; content only ever gets ADDED,
  // so a render always sees the same-or-older state than its subscription —
  // a load transition changes the subscribed value, re-renders, and this
  // resolution self-heals on the next render.
  const store = useStore();
  const renderDecl: FieldSelector | null = field.scope === scopes.component
    ? (resolveGetter(store.getState(), props, options.stateKey, field.name)?.decl ?? null)
    : null;
  const pipelined = !!renderDecl && typeof renderDecl === 'object' && 'deps' in renderDecl;
  const declaredEquality = renderDecl && typeof renderDecl === 'object' && !('deps' in renderDecl)
    ? renderDecl.equality : undefined;
  // Read pipeline law: subscribe cheap → gate on equality → interpret after.
  // Pipelined getters gate on their deps ARRAY (shallow-compared);
  // { select, equality } gates on the declared RESULT equality; bare fns and
  // stored reads gate on field.equality ?? the caller's override.
  const equality = pipelined
    ? shallowEqual
    : (declaredEquality ?? field.equality ?? options.equalityFn);
  const gated = useSelector(
    (state) => {
      // Blueprint getters are honored for own AND cross reads — the hook must
      // agree with fieldSelector (one meaning per level). Getterless fields
      // subscribe raw storage so the gate compares the reference-stable
      // representation; decode runs after, below.
      if (field.scope === scopes.component) {
        const resolved = resolveGetter(state, props, options.stateKey, field.name);
        if (resolved) {
          const { decl } = resolved;
          if (typeof decl === 'object' && 'deps' in decl) {
            // Pipelined form: subscribe the deps array only. deps take state,
            // so the re-entrancy guard wraps them like any getter body.
            return withGetterGuard(resolved.stateKey, field.name, () =>
              decl.deps(state, resolved.targetProps, resolved.stateKey));
          }
          return evalGetter(state, resolved, field.name, options.fallback);
        }
      }
      return rawFieldSelector(state, props, field, options);
    },
    equality
  );
  // Interpret after the gate. Pipelined getters compute from the gated deps —
  // useSelector returns the PREVIOUS array while the gate holds, so the memo
  // re-runs compute only when deps really changed. Getter results are final
  // (never re-decoded); stored reads decode via field.read. This return is the
  // hook's single ObservableValue stamp point (types/fieldValues.ts doctrine).
  const fallback = options.fallback;
  const value = useMemo(() => {
    if (pipelined && Array.isArray(gated)) {
      const computed = (renderDecl as { compute: (...deps: any[]) => unknown }).compute(...gated);
      return computed === undefined ? fallback : computed;
    }
    if (renderDecl) return gated;
    return field.read ? field.read(gated as RawFieldValue<any>) : gated;
    // fallback participates only in the undefined-compute edge; a fresh-but-
    // equal literal there is indistinguishable, so it stays out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated, renderDecl, pipelined, field]);
  return asObservableValue(value) as ObservableValue<T>;
};


/**
 * Hook to access the current user identity from Redux.
 * Returns null until the server's auth echo has landed.
 *
 * We might consider a dummy name until auth. Dunno. We're
 * still figuring this out.
 */
export function useUser(): CurrentUser | null {
  return useSelector(
    (state: any) => state?.application_state?.system?.currentUser ?? null
  );
}


// =============================================================================
// Dispatch infrastructure
// =============================================================================

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
    const resolved = resolveSetter(state, props, stateKey, field.name);
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
        ? targetBlueprint(props.runtime.store.getState(), props, stateKey)?.loBlock
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


export function useFieldState(
  props: BaselineProps | null,
  field: FieldInfo,
  fallback?,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {}
) {
  assertValidField(field);

  // URL field sync: check URL search params for an override of the fallback.
  // Only applies to fields with url:true — other fields skip this entirely.
  const propsId = (props as any)?.id;
  const urlOverride = field.url ? getUrlOverride(propsId, field) : undefined;
  const effectiveFallback = urlOverride !== undefined ? urlOverride : fallback;

  const value = useFieldSelector(props, field, { fallback: effectiveFallback, stateKey, tag });

  const ref = useRef({ props, field, stateKey, tag, fallback });
  ref.current = { props, field, stateKey, tag, fallback };
  const setValue = useCallback(
    (newValue: any) => {
      const { props, field, stateKey, tag } = ref.current;
      updateField(props, field, newValue, { stateKey, tag });
      // Sync to URL for url-enabled fields
      if (field.url) {
        setUrlValue((props as any)?.id, field, newValue);
      }
    },
    []
  );

  // Browser back/forward: re-sync url-enabled fields from the URL. The
  // popstate URL is already what the user navigated to, so update the field
  // only — going through setValue would write history again (and urlPush
  // fields would push a new entry, breaking further back-navigation).
  // A field whose param is absent after navigation reverts to its fallback.
  useEffect(() => {
    if (!field.url || typeof window === 'undefined') return;
    const onPop = () => {
      const { props, field, stateKey, tag, fallback } = ref.current;
      const urlValue = getUrlOverride((props as any)?.id, field);
      updateField(props, field, urlValue !== undefined ? urlValue : fallback, { stateKey, tag });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // field.url/name are stable per field declaration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.url, field.name]);

  return [value, setValue];
}


// =============================================================================
// Aggregation hooks
// =============================================================================

type ReduxAggregateOptions<T, R = any> = {
  fallback?: T;
  tag?: string;
  aggregate?: 'list' | 'object' | ((values: T[], ids: string[]) => R);
};

/**
 * React hook to read the same field for multiple component IDs.
 *
 * This mirrors `useFieldState`'s read-path but aggregates the values from
 * several IDs into either an array (default) or an object keyed by ID.
 */
export function useAggregate<T = any, R = any>(
  props,
  field: FieldInfo,
  stateKeys: StateKey[],
  { fallback, tag, aggregate = 'list' }: ReduxAggregateOptions<T, R> = {}
) {
  assertValidField(field);

  return useSelector(
    (state) => {
      const values = stateKeys.map((stateKey) =>
        fieldSelector(state, props, field, { fallback, stateKey, tag }),
      );

      if (typeof aggregate === 'function') {
        return aggregate(values, stateKeys as unknown as string[]);
      }

      if (aggregate === 'object') {
        return Object.fromEntries(stateKeys.map((key, index) => [key, values[index]]));
      }

      return values;
    },
    shallowEqual,
  );
}

/**
 * Core: look up a field definition given a resolved DefinitionKey.
 */
function _componentField(props: RuntimeProps, definitionKey: DefinitionKey, fieldName: string): FieldInfo {
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale.code;
  const targetNode = selectBlock(props.runtime.store.getState(), sources, definitionKey, locale);
  if (!targetNode) {
    throw new Error(`Could not find component "${definitionKey}". Check that the id exists in your OLX and is spelled correctly.`);
  }

  const targetLoBlock = props.runtime.blockRegistry[targetNode.tag];
  if (!targetLoBlock) {
    throw new Error(`Unknown component type <${targetNode.tag}>. This tag is not registered as a block.`);
  }

  const field = targetLoBlock.fields?.[fieldName]
    // Selector-backed fields (computed, possibly with no stored backing —
    // metagraders' grading quartet) resolve to the common field shape;
    // reads route through the blueprint selector in fieldSelector.
    ?? (targetLoBlock.selectors?.[fieldName] ? (commonFields as Record<string, FieldInfo>)[fieldName] : undefined);
  if (!field) {
    const availableFields = [
      ...Object.keys(targetLoBlock.fields || {}),
      ...Object.keys(targetLoBlock.selectors || {}),
    ];
    throw new Error(`<${targetNode.tag} id="${definitionKey}"> has no "${fieldName}" field. Available fields: ${availableFields.join(', ') || 'none'}`);
  }

  return field;
}

/**
 * Look up a field definition from another component by StateKey and field name.
 * Use when you have a resolved StateKey (from stateKeyForGlobalRef or scopedStateKeyForBlock).
 *
 * @example
 *   const targetStateKey = stateKeyForGlobalRef(target);
 *   const field = componentFieldByStateKey(props, targetStateKey, 'value');
 *   const val = useFieldSelector(props, field, { stateKey: targetStateKey });
 */
export function componentFieldByStateKey(props: RuntimeProps, stateKey: StateKey, fieldName: string): FieldInfo {
  return _componentField(props, leafDefinitionKeyFromStateKey(stateKey), fieldName);
}


/**
 * Selector function to get a component's value by ID.
 * Tries the block's selectors.value first, falls back to direct field access.
 *
 * @param {Object} props - Component props with blockRegistry and olxJsonSources
 * @param {Object} state - Redux state
 * @param {string} id - ID of the component to get value from
 * @param {Object} options - Options object with fallback and other settings
 * @returns {any} The component's current value
 */


/**
 * Reconstruct a component's RuntimeProps from its Redux key and blueprint.
 *
 * Used when we need a component's own props outside of its render tree
 * (e.g., calling a blueprint selector from valueSelector). Looks up the component's
 * OlxDomNode by StateKey — if found, delegates to propsFromNode.
 *
 * Falls back to manual construction with the caller's runtime context if
 * the target hasn't been rendered yet (no DomNode available).
 */
export function propsForNode(callerProps: RuntimeProps, stateKey: StateKey, node: OlxJson, loBlock: LoBlock) {
  const domNode = callerProps.nodeInfo
    ? getDomNodeByStateKey(callerProps, stateKey)
    : null;

  if (domNode) return propsFromNode(domNode);

  // Pre-render fallback: no DomNode yet, use the caller's runtime context.
  // Instance scope derives from the ADDRESSED key — the caller's own prefix
  // is the wrong scope for a cross-instance target (a base-scope caller
  // reading list:#0:input must produce list:#0-scoped target props).
  return {
    ...node.attributes,
    id: node.id,
    kids: node.kids ?? [],
    loBlock,
    fields: loBlock.fields,
    locals: loBlock.locals,
    runtime: callerProps.runtime,
    nodeInfo: callerProps.nodeInfo,
    idPrefix: scopePrefixOfStateKey(stateKey),
  };
}

// =============================================================================
// Block data helpers (re-exported from blockData.ts for shared server/client use)
// =============================================================================

import { blockData, evaluateFieldSelector, selectorReturnsBlockData } from './blockData';
export { blockData, withStatus, RETURNS_BLOCK_DATA } from './blockData';

// =============================================================================
// Value selector / hook / getter
// =============================================================================

/**
 * Select a component's value by ID from Redux state.
 *
 * Returns BlockDataResult & { value } — never throws.
 *
 * - If the block is in Redux and ready, calls its selectors.value (or falls back
 *   to the common 'value' field).
 * - If the block is loading or unknown, returns { value: fallback, loading: true }.
 * - If the block errored, returns { value: fallback, error: message }.
 *
 * Blocks whose value selector is wrapped in `withStatus()` return their own BlockDataResult;
 * all others get their raw return value wrapped automatically.
 */
export function valueSelector(
  props: RuntimeProps,
  state: any,
  stateKey: StateKey | null | undefined,
  { fallback = '' } = {} as { fallback?: any }
): BlockDataResult & { value: ObservableValue<any> } {
  // valueSelector is a level-3 read: every exit below is a stamp point where
  // getter-author output (or the fallback) becomes ObservableValue.
  if (stateKey === undefined || stateKey === null) {
    return { value: asObservableValue(fallback), ...blockData('ready') };
  }

  // StateKey → DefinitionKey for content store lookup
  const mapKey = leafDefinitionKeyFromStateKey(stateKey);
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale.code;
  const targetNode = selectBlock(state, sources, mapKey, locale);
  const loBlock = targetNode ? props.runtime.blockRegistry[targetNode.tag] : null;

  if (!targetNode || !loBlock) {
    const bs = selectBlockState(state, sources, mapKey);
    if (bs?.loadingState?.status === 'error') {
      return { value: asObservableValue(fallback), ...blockData('error', bs.error?.message ?? `Block "${stateKey}" not found`) };
    }
    return { value: asObservableValue(fallback), ...blockData('loading') };
  }

  const valueSelect = loBlock.selectors?.value;
  if (valueSelect) {
    const targetProps = propsForNode(props, stateKey, targetNode, loBlock) as RuntimeProps;
    // All three declaration forms evaluate here (no gate to optimize).
    const raw = evaluateFieldSelector(valueSelect, state, targetProps, stateKey);

    if (selectorReturnsBlockData(valueSelect)) {
      return raw as BlockDataResult & { value: ObservableValue<any> };
    }

    return { value: asObservableValue(raw), ...blockData('ready') };
  }

  // Fall back to direct field access using the common 'value' field
  return { value: fieldSelector(state, props, commonFields.value, { stateKey, fallback }), ...blockData('ready') };
}

/**
 * React hook to get a component's value by ID with automatic re-rendering.
 *
 * Returns BlockDataResult & { value }:
 * - `value` is guaranteed usable (fallback while loading, real value when ready)
 * - `loading`, `ready`, `error`, `status` report the block's data state
 *
 * Triggers async loading for blocks not yet in Redux.
 *
 * 95% of blocks just destructure `{ value }` and ignore the rest.
 */
export function useValue(
  props: RuntimeProps,
  {
    stateKey,
    target,
    fallback,
  }: {
    stateKey?: StateKey | null;
    target?: StateRef | null;
    fallback?: any;
  } = {}
): BlockDataResult & { value: ObservableValue<any> } {
  // Priority: explicit stateKey > target (resolved) > own component
  const resolvedKey: StateKey | null =
    stateKey !== undefined ? stateKey
    : target !== undefined ? (target ? stateKeyForGlobalRef(target, props.runtime.ns) : null)
    : scopedStateKeyForBlock(props);

  const result = useSelector(
    (state) => valueSelector(props, state, resolvedKey, { fallback }),
    (a, b) => a.value === b.value && a.status === b.status && a.error === b.error
  );

  // Trigger async load if block is unknown in Redux.
  // props is intentionally omitted from the deps: ensureBlock deduplicates via
  // module-level Set, so stale props cannot cause duplicate fetches. Including
  // props would cause spurious effect re-runs.
  const source = props.runtime.olxJsonSources?.[0] ?? 'content';
  const sideEffectFree = props.runtime.sideEffectFree;
  useEffect(() => {
    if (resolvedKey && result.loading) {
      ensureBlock(props, leafDefinitionKeyFromStateKey(resolvedKey), source);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, result.status, source, sideEffectFree]);

  return result;
}

/**
 * React hook for text-display blocks that can receive their source text
 * from any of four places. Pairs with `parsers.text.withTarget()`. Used
 * by blocks like Mermaid, Markdown, and ObservablePlot, whose source
 * text might come from:
 *
 *   - child text          → parsed at parse time into `kids`
 *   - `src=` attribute    → loaded at parse time into `kids`
 *   - own value field     → settable via `<Set target="me" value="..."/>`
 *   - `target=` attribute → reactive read from another block's value
 *
 * All four routes converge on `useValue`, which routes through the
 * appropriate block's value selector. The `withTarget` parserMixin
 * supplies a `selectors.value` that reads `commonFields.value` with a
 * fallback to `kids`, so the static-text and settable-value cases both
 * work without special handling here.
 *
 * - No `target=` → `useValue`'s natural default of "this block" kicks
 *   in: reads through *this* block's selectValue (Redux value → kids).
 * - `target="other"` → reads through the *target* block's selectValue.
 *   If the target also uses this mixin (or any block with a compatible
 *   value field — TextArea, etc.), it just works.
 *
 * 95% of callers can just destructure `{ text }` and let the loading
 * branch render a spinner.
 */
export function useTextContent(
  props: RuntimeProps,
  { fallback = '' }: { fallback?: string } = {}
): { text: string; loading: boolean; error: string | null; ready: boolean } {
  const target = typeof props.target === 'string'
    ? parseAnyStateRef(props.target)
    : undefined;
  const result = useValue(props, { target, fallback });

  const text =
    typeof result.value === 'string'
      ? result.value
      : result.value == null
        ? fallback
        : String(result.value);

  return { text, loading: result.loading, error: result.error, ready: result.ready };
}

/**
 * React hook to get the full Redux state object for a component.
 *
 * INTENDED FOR DEBUGGING/INTROSPECTION ONLY - not for regular block development.
 * Use useFieldSelector or useValue for normal state access.
 *
 * @param {Object} props - Component props (for ID resolution context)
 * @param {string} targetId - ID of the component to inspect
 * @param {Object} options - Options object
 * @param {string} options.scope - State scope (defaults to 'component')
 * @returns {Object|null} The full state object for the component, or null if none
 */
export function useComponentState(
  props,
  stateKey: StateKey,
  { scope = scopes.component }: { scope?: string } = {}
) {
  return useSelector(
    (state: any) => state?.application_state?.[scope]?.[stateKey] || null,
    shallowEqual
  );
}
