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
// - `useReduxInput`: Complete form control integration with selection state
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
import { assertValidField } from './fields';
import { getUrlOverride, setUrlValue } from './urlFields';
import type { Store } from 'redux';
import { selectBlock, selectBlockState } from './olxjson';
import { getDomNodeByStateKey, propsFromNode } from '../blocks/olxdom';
import { ensureBlock } from '../blocks/useOlxJson';
import { getReduxStoreInstance } from './store';


const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import
const INVALIDATED_INPUT = 'INVALIDATED_INPUT'; // informational


// =============================================================================
// Selectors
// =============================================================================

// Options for fieldSelector and friends.
// stateKey overrides which component's state to access (cross-component access).
// If omitted, the component's own key is resolved from props.
export interface SelectorOptions<T> {
  stateKey?: StateKey;
  tag?: string;
  selector?: (state) => T;
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
}

/**
 * Core selector for field values.
 *
 * Accepts BaselineProps or RuntimeProps. For component/storage scope, needs the
 * full props object with id/nodeInfo for ID resolution. For system scope, only
 * needs the scope name from field.
 */
export const fieldSelector = <T>(
  state,
  props,
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): T => {
  const {
    stateKey,
    tag: optTag,
    // TODO: This should run over the field. We do this for when we need multiple fields (ReduxInput),
    // but really, field should be a list
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
  return value === undefined ? (fallback as T) : value;
};

// Convenience selector that fetches the current Redux state automatically.
export const selectFromStore = <T>(
  props: { runtime: { store: Store } },
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): T => {
  const state = props.runtime.store.getState();
  return fieldSelector(state, undefined, field, options);
};

// Synchronous getter for Redux state - mirrors useFieldState but without re-renders.
// Gets store from singleton internally (initialized in storeWrapper.tsx).
export const getReduxState = (
  props: any,
  field: FieldInfo,
  fallback: any,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {}
): any => {
  assertValidField(field);

  const store = getReduxStoreInstance();
  const state = store.getState();
  return fieldSelector(state, props, field, { fallback, stateKey, tag });
};

/**
 * Synchronous getter for a decoded field value.
 * Keeps field materialization in state layer for non-hook callers.
 */
export const getField = <T>(
  props: any,
  field: FieldInfo,
  options: SelectorOptions<any> = {}
): T => {
  assertValidField(field);
  const store = getReduxStoreInstance();
  const state = store.getState();
  const raw = fieldSelector(state, props, field, options);
  return decodeField(field, raw);
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
 * // Future: branded types to prevent raw/decoded confusion at compile time
 * // type RawFieldValue<T> = T & { readonly __raw: 'RawFieldValue' };
 * // type DecodedFieldValue<T> = T & { readonly __decoded: 'DecodedFieldValue' };
 * // fieldSelector would return RawFieldValue, decodeField would return DecodedFieldValue
 */
export function decodeField(field: FieldInfo, raw: any): any {
  return field.read ? field.read(raw) : raw;
}

/** @deprecated Use decodeField instead. */
export const readField = decodeField;

/**
 * Get a human/LLM-readable string from a raw field value.
 * Uses field.display if defined, otherwise falls back to stringifying the read value.
 */
export function displayField(field: FieldInfo, raw: any): string {
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
): T => {
  const raw = useSelector(
    (state) => fieldSelector(state, props, field, options),
    field.equality ?? options.equalityFn
  );
  // Apply field.read only when using the default selector (reading the field's own value).
  // Custom selectors (e.g., reading selection sibling fields) handle their own transformation.
  if (!options.selector && field.read) {
    return field.read(raw) as T;
  }
  return raw;
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

  if (field.write) {
    // Field knows how to produce its own events (e.g., docField computes splices)
    const store = props?.runtime?.store ?? getReduxStoreInstance();
    const oldRaw = fieldSelector(store.getState(), props, field, { stateKey, tag });
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

  const ref = useRef({ props, field, stateKey, tag });
  ref.current = { props, field, stateKey, tag };
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


// =============================================================================
// UI binding hooks (future: migrate to bindings/)
// =============================================================================

type ReduxInputOptions = {
  updateValidator?: (val: string) => boolean;
};


export function useReduxInput(
  props: RuntimeProps,
  field: FieldInfo,
  fallback = '',
  options: ReduxInputOptions = {}
) {
  const scope = field.scope ?? scopes.component;
  const fieldName = field.name;
  const { updateValidator } = options;

  const selectorFn = (state) =>
    state && state[fieldName] !== undefined ? state[fieldName] : fallback;

  const value = useFieldSelector(props, field, { selector: selectorFn, fallback });

  const selection = useFieldSelector(
    props,
    field,
    {
      selector: s => ({
        selectionStart: s?.[`${fieldName}.selectionStart`] ?? 0,
        selectionEnd: s?.[`${fieldName}.selectionEnd`] ?? 0
      }),
      equalityFn: shallowEqual
    }
  );

  const id = scopedStateKeyForBlock(props);
  const tag = props.loBlock.name;
  const logEvent = props.runtime.logEvent;

  const onChange = useCallback((event) => {
    const val = event.target.value;
    const selStart = event.target.selectionStart;
    const selEnd = event.target.selectionEnd;
    const payload = {
      scope,
      [fieldName]: val,
      [`${fieldName}.selectionStart`]: selStart,
      [`${fieldName}.selectionEnd`]: selEnd
    };
    if (scope === scopes.component) payload.id = id;
    if (scope === scopes.componentSetting) payload.tag = tag;

    if (updateValidator && !updateValidator(val)) {
      logEvent(INVALIDATED_INPUT, payload);
      return;
    }

    logEvent(UPDATE_INPUT, payload);
  }, [id, tag, fieldName, updateValidator, scope, logEvent]);

  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    if (
      input &&
      document.activeElement === input &&
      selection.selectionStart != null &&
      selection.selectionEnd != null
    ) {
      try {
        input.setSelectionRange(selection.selectionStart, selection.selectionEnd);
      } catch (e) { /* ignore */ }
    }
  }, [value, selection.selectionStart, selection.selectionEnd]);

  // Put ref in the returned props object!
  return [
    value,
    {
      name: fieldName,
      value,
      onChange,
      ref
    }
  ];
}




export function useReduxCheckbox(
  props,
  field: FieldInfo,
  fallback = false,
  opts: { stateKey?: StateKey; tag?: string } = {}
) {
  assertValidField(field);
  const [checked, setChecked] = useFieldState(props, field, fallback, opts);
  const onChange = useCallback((event) => setChecked(event.target.checked), [setChecked]);
  return [checked, { name: field.name, checked, onChange }];
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

  const field = targetLoBlock.fields?.[fieldName];
  if (!field) {
    const availableFields = Object.keys(targetLoBlock.fields || {});
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
 * Tries selectValue method first, falls back to direct field access.
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
 * (e.g., calling selectValue from valueSelector). Looks up the component's
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
 * - If the block is in Redux and ready, calls its selectValue (or falls back
 *   to the common 'value' field).
 * - If the block is loading or unknown, returns { value: fallback, loading: true }.
 * - If the block errored, returns { value: fallback, error: message }.
 *
 * Blocks with `withStatus(selectValue)` return their own BlockDataResult;
 * all others get their raw return value wrapped automatically.
 */
export function valueSelector(
  props: RuntimeProps,
  state: any,
  stateKey: StateKey | null | undefined,
  { fallback = '' } = {} as { fallback?: any }
): BlockDataResult & { value: any } {
  if (stateKey === undefined || stateKey === null) {
    return { value: fallback, ...blockData('ready') };
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
      return { value: fallback, ...blockData('error', bs.error?.message ?? `Block "${stateKey}" not found`) };
    }
    return { value: fallback, ...blockData('loading') };
  }

  if (loBlock.selectValue) {
    const targetProps = propsForNode(props, stateKey, targetNode, loBlock);

    if ((loBlock.selectValue as any)[RETURNS_BLOCK_DATA]) {
      return loBlock.selectValue(targetProps, state, stateKey);
    }

    return { value: loBlock.selectValue(targetProps, state, stateKey), ...blockData('ready') };
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
): BlockDataResult & { value: any } {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps — props is intentionally
  // omitted: ensureBlock deduplicates via module-level Set, so stale props cannot
  // cause duplicate fetches. Including props would cause spurious effect re-runs.
  const source = props.runtime.olxJsonSources?.[0] ?? 'content';
  const sideEffectFree = props.runtime.sideEffectFree;
  useEffect(() => {
    if (resolvedKey && result.loading) {
      ensureBlock(props, leafDefinitionKeyFromStateKey(resolvedKey), source);
    }
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
 * appropriate block's `selectValue`. The `withTarget` parserMixin
 * supplies a `selectValue` that reads `commonFields.value` with a
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
