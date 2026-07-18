// packages/shared/lib/state/redux.ts
//
// Redux integration layer - React hooks and utilities for accessing Learning Observer state.
//
// Provides the interface between React components and the Redux store, with
// Learning Observer-specific features:
// - Field-based selectors that understand scoping and ID resolution
// - Automatic state updates through lo_event logging
// - Input-specific hooks for form controls with selection tracking
// - Type-safe state access with fallback values
//
// Key functions:
// - `useFieldSelector`: Get state values with automatic re-rendering
// - `updateField`: Update state and trigger analytics logging
// - `fieldSelector`: Core selector logic for different state scopes
//
// The system bridges the educational semantics (fields, scopes, analytics)
// with standard React patterns, making it easy for block developers to
// build stateful learning components.
//
//
// Design:
//
// There should be a hierarchy of **selectors** usable within hooks.
//
// For each selector, there should be two functions, a hook and a
// functional version, e.g.
//
// fieldSelector
// - useField (reactive hook version)
// - getField (functional version, used e.g. inside of an action, grader, or callback)
//
// These should be grouped together. The hook and function should be thin wrappers for
// the selector. The selector is where all logic happens.
//
// TODO: Clean up code to reflect the design.

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSelector, shallowEqual } from 'react-redux';

import * as lo_event from 'lo_event';

import { scopedStateKeyForBlock, leafDefinitionKeyFromStateKey, stateKeyForGlobalRef, parseAnyStateRef, isNamespaceQualified, qualifyDefinitionRef } from '../types/id-grammar';
import { commonFields } from './commonFields';

import { scopes } from '../state/scopes';
import { FieldInfo, DefinitionRef, DefinitionKey, StateRef, StateKey, RuntimeProps, BaselineProps, OlxJson, LoBlock, BlockDataResult, BlockDataStatus, CurrentUser } from '../types';
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
export interface SelectorOptions<T> {
  stateKey?: StateKey;
  tag?: string;
  /** @deprecated A custom bucket projection selects the level by option
   *  rather than by function name. The only remaining user is useInputField's
   *  selection read, removed in the selection redesign. Do not add callers. */
  selector?: (state) => T;
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
  /** @deprecated A storage-level read expressed as an option. Superseded by
   *  rawFieldSelector/decodedFieldSelector — the level is the function name.
   *  Retained only until the last call sites migrate; do not add callers. */
  stored?: boolean;
}

// The three read levels. One meaning per function name; the level is chosen at
// the call site by the name, never by an option:
//   1 rawFieldSelector     — storage representation (no decode, no getter)
//   2 decodedFieldSelector — field.read applied (no getter)
//   3 fieldSelector        — observable value: blueprint getter ?? decoded
// Each level strictly strips interpretation from the one above. Level 3 is the
// only one block-facing code reads; levels 1–2 are storage-layer tools
// (selector implementations, write-path diffing, the DOM↔storage editing
// binding). All three accept BaselineProps or RuntimeProps: component/storage
// scope needs id/nodeInfo for ID resolution, system scope needs only the field.

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
  const {
    stateKey,
    tag: optTag,
    selector = (s: any) => s?.[field.name],
    fallback,
  } = options;
  const { scope } = field;
  const scopedState = state?.application_state?.[scope];
  const value: T | undefined = (() => {
    switch (scope) {
      case scopes.componentSetting: {
        const tag = optTag ?? props?.loBlock?.name;
        return selector(scopedState?.[tag]);
      }
      case scopes.system:
        return selector(scopedState);
      case scopes.storage:
      case scopes.component: {
        const key = stateKey ?? scopedStateKeyForBlock(props);
        return selector(scopedState?.[key]);
      }
      default:
        throw new Error('Unrecognized scope');
    }
  })();
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
  // so its body must reach the store through level 1/2 — reading back through
  // level 3 on its own field recurses (the guard in evalGetter throws).
  // Getter authors return plain values; the exits below are the stamp points
  // where results become ObservableValue (types/fieldValues.ts doctrine).
  if (field.scope === scopes.component && !options.stored && !options.selector) {
    const resolved = resolveGetter(state, props, options.stateKey, field.name);
    if (resolved) {
      return asObservableValue(evalGetter(state, resolved, field.name, options.fallback)) as ObservableValue<T>;
    }
  }
  return asObservableValue(decodedFieldSelector(state, props, field, options));
};

/**
 * Resolve the blueprint getter for a field plus the props/key to call it with.
 * Cross reads (an explicit stateKey) resolve against the addressed block's
 * content node; own reads resolve straight off props.loBlock — cheaper, no
 * content lookup. Null when there is no getter (a plain stored field).
 */
function resolveGetter(state: any, props: any, stateKey: StateKey | undefined, fieldName: string) {
  if (stateKey) return blueprintSelectorFor(state, props, stateKey, fieldName);
  const select = props?.loBlock?.selectors?.[fieldName];
  if (!select) return null;
  return { select, targetProps: props as RuntimeProps, stateKey: scopedStateKeyForBlock(props) };
}

/**
 * Resolve the blueprint getter for a field on the block a StateKey addresses,
 * plus the target props/key to call it with. Null when the target block is
 * unknown (content loading) or declares no getter for the field.
 */
function blueprintSelectorFor(state: any, props: any, stateKey: StateKey, fieldName: string) {
  const runtime = props?.runtime;
  if (!runtime) return null;
  let defKey: DefinitionKey;
  try {
    defKey = leafDefinitionKeyFromStateKey(stateKey);
  } catch {
    // Keys outside the content grammar (app-level buffers, test fixtures)
    // have no blueprint — plain stored reads.
    return null;
  }
  const node = selectBlock(state, runtime.olxJsonSources ?? ['content'], defKey, runtime.locale?.code);
  const loBlock = node ? runtime.blockRegistry[node.tag] : undefined;
  const select = loBlock?.selectors?.[fieldName];
  if (!select || !node) return null;
  return { select, targetProps: propsForNode(props, stateKey, node, loBlock!) as RuntimeProps, stateKey };
}

// Getter evaluations in flight, keyed `${stateKey}|${fieldName}`. A getter that
// reads its own field back through level-3 fieldSelector recurses forever; we
// throw instead. Always on (cheap) — the fix is to read the backing store.
const gettersInFlight = new Set<string>();

function evalGetter(
  state: any,
  resolved: { select: any; targetProps: RuntimeProps; stateKey: StateKey },
  fieldName: string,
  fallback: any,
) {
  const { select, targetProps, stateKey } = resolved;
  const guardKey = `${stateKey}|${fieldName}`;
  if (gettersInFlight.has(guardKey)) {
    throw new Error(
      `selector for ${fieldName} on ${stateKey} re-enters itself — `
      + 'read the backing store with decodedFieldSelector/rawFieldSelector',
    );
  }
  gettersInFlight.add(guardKey);
  try {
    const raw = select(state, targetProps, stateKey);
    // withStatus selectors return BlockDataResult — unwrap to the value.
    const value = (select as any)[RETURNS_BLOCK_DATA] ? (raw as any)?.value : raw;
    return value === undefined ? fallback : value;
  } finally {
    gettersInFlight.delete(guardKey);
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
  // result (own and cross alike — same semantics as fieldSelector); stored
  // fields subscribe level 1 (raw) for the equality gate and decode AFTER it.
  // decode() may mint a new object each call (a Set from an OR-Set CRDT); the
  // raw value is reference-stable between dispatches, so gating on it is what
  // keeps re-renders — and input cursors — stable. Do NOT "simplify" this to
  // wrap fieldSelector, which decodes before returning and would defeat the
  // gate.
  //
  // field.equality compares the field's RAW value. A custom selector projection
  // (deprecated) returns something else entirely (useInputField's fresh
  // {selectionStart, selectionEnd}), so it must bring its own equalityFn.
  // On getter-backed fields the gate compares getter RESULTS: fine for the
  // scalar getters every current consumer reads; object-returning getters
  // churn until step 4's declared getter equality lands.
  const equality = options.selector
    ? options.equalityFn
    : (field.equality ?? options.equalityFn);
  // Own-read getter presence is state-independent (props.loBlock), so whether
  // the subscription below returns a getter result or raw storage is knowable
  // here — it drives the decode decision after the gate.
  const ownGetter = !options.stateKey && !options.stored && !options.selector
    && field.scope === scopes.component && !!props?.loBlock?.selectors?.[field.name];
  const raw = useSelector(
    (state) => {
      // Blueprint getters are honored for own AND cross reads — the hook must
      // agree with fieldSelector (one meaning per level). Getterless fields
      // subscribe raw storage so the gate compares the reference-stable
      // representation; decode runs after, below.
      if (!options.stored && !options.selector && field.scope === scopes.component) {
        const resolved = resolveGetter(state, props, options.stateKey, field.name);
        if (resolved) return evalGetter(state, resolved, field.name, options.fallback);
      }
      return rawFieldSelector(state, props, field, options);
    },
    equality
  );
  // Apply field.read only for the default raw projection. Own getter results
  // are already final — never re-decoded. (Cross getter results pass through
  // field.read as they always have; presence depends on content loading, and
  // current read transforms are idempotent on decoded values.) Custom
  // selectors handle their own transformation. This post-gate return is the
  // hook's single ObservableValue stamp point (types/fieldValues.ts doctrine).
  const value = (!ownGetter && !options.selector && field.read)
    ? field.read(raw)
    : raw;
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

// Accepts BaselineProps (system scope) or RuntimeProps (component/storage scope).
// Polymorphic: branches on field.scope to access different properties.
// TODO: Consider splitting into updateSystemField / updateComponentField for type safety.
export function updateField(
  props: BaselineProps | null,
  field: FieldInfo,
  newValue,
  { stateKey, tag, extraPayload }: { stateKey?: StateKey; tag?: string; extraPayload?: Record<string, any> } = {}
) {
  assertValidField(field);

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
  if (extraPayload && field.level && field.level !== 'user') {
    const logEvent = props ? (props as any).runtime.logEvent : lo_event.logEvent;
    logEvent(UPDATE_INPUT, {
      scope: field.scope,
      id: stateKey ?? scopedStateKeyForBlock(props as RuntimeProps),
      ...extraPayload,
    });
    extraPayload = undefined;
  }

  if (field.write) {
    // Field knows how to produce its own events (e.g., docField computes splices)
    const store = props?.runtime?.store ?? getReduxStoreInstance();
    const oldRaw = rawFieldSelector(store.getState(), props, field, { stateKey, tag });
    const results = field.write(oldRaw, newValue);
    // Extra payload (e.g., selection state from useInputField) is appended only
    // to the last event — it represents final cursor position, not per-event state.
    for (let i = 0; i < results.length; i++) {
      const { event, payload } = results[i];
      const extra = (i === results.length - 1) ? extraPayload : undefined;
      dispatchFieldEvent(props, field, event, { ...payload, ...extra }, { stateKey, tag });
    }
  } else {
    // Default: single event with { [fieldName]: newValue }
    dispatchFieldEvent(props, field, field.event!, { [field.name]: newValue, ...extraPayload }, { stateKey, tag });
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

  // Pre-render fallback: no DomNode yet, use caller's context
  return {
    ...node.attributes,
    id: node.id,
    kids: node.kids ?? [],
    loBlock,
    fields: loBlock.fields,
    locals: loBlock.locals,
    runtime: callerProps.runtime,
    nodeInfo: callerProps.nodeInfo,
    idPrefix: callerProps.runtime.idPrefix,
  };
}

// =============================================================================
// Block data helpers (re-exported from blockData.ts for shared server/client use)
// =============================================================================

import { blockData, RETURNS_BLOCK_DATA } from './blockData';
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

    if ((valueSelect as any)[RETURNS_BLOCK_DATA]) {
      return valueSelect(state, targetProps, stateKey) as BlockDataResult & { value: ObservableValue<any> };
    }

    return { value: asObservableValue(valueSelect(state, targetProps, stateKey)), ...blockData('ready') };
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
