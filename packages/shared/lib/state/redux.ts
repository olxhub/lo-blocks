// src/lib/state/redux.ts
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

import * as idResolver from '../blocks/idResolver';
import { commonFields } from './commonFields';

import { scopes } from '../state/scopes';
import { FieldInfo, OlxReference, OlxKey, ReduxStateKey, RuntimeProps, BaselineProps, OlxJson, LoBlock, BlockDataResult, BlockDataStatus } from '../types';
import { assertValidField } from './fields';
import type { Store } from 'redux';
import { selectBlock, selectBlockState } from './olxjson';
import { getDomNodeByReduxKey } from '../blocks/olxdom';
import { ensureBlock } from '../blocks/useOlxJson';
import { getReduxStoreInstance } from './store';


const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import
const INVALIDATED_INPUT = 'INVALIDATED_INPUT'; // informational


// Internal: resolved options for fieldSelector (id is already a ReduxStateKey)
export interface SelectorOptions<T> {
  id?: ReduxStateKey | boolean;
  tag?: string | boolean;
  selector?: (state) => T;
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
}

/**
 * Convert OlxReference/OlxKey → ReduxStateKey at hook/public-API boundary.
 * Boolean and undefined pass through unchanged.
 */
function resolveOlxId(props: any, id?: OlxReference | boolean): ReduxStateKey | boolean | undefined {
  if (typeof id === 'string') {
    return idResolver.refToReduxKey({ ...props, id });
  }
  return id;
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
    id: optId,
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
        const tag = optTag ?? props?.loBlock?.OLXName;
        return selector(scopedState?.[tag]);
      }
      case scopes.system:
        return selector(scopedState);
      case scopes.storage:
      case scopes.component: {
        // If optId is a ReduxStateKey, use it directly (cross-component access).
        // Otherwise, resolve the component's own ID from props.
        const id = typeof optId === 'string'
          ? optId
          : idResolver.refToReduxKey(props);
        return selector(scopedState?.[id]);
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

// Synchronous getter for Redux state - mirrors useFieldState but without re-renders
// Same signature as useFieldState: (props, field, fallback, { id, tag })
// Gets store from singleton internally (initialized in storeWrapper.tsx)
export const getReduxState = (
  props: any,
  field: FieldInfo,
  fallback: any,
  { id, tag }: { id?: OlxReference | boolean; tag?: string | boolean } = {}
): any => {
  assertValidField(field);

  const store = getReduxStoreInstance();
  const state = store.getState();
  return fieldSelector(state, props, field, { fallback, id: resolveOlxId(props, id), tag });
};

/** React-friendly wrapper that forwards any equalityFn from options.
 *  Accepts OlxKey for id and resolves to ReduxStateKey internally.
 */
export const useFieldSelector = <T>(
  props: any,               // TODO: narrow when convenient
  field: FieldInfo,
  options: Omit<SelectorOptions<T>, 'id'> & { id?: OlxReference | boolean } = {} as any
): T => {
  const { id, ...rest } = options;
  const resolved: SelectorOptions<T> = { ...rest, id: resolveOlxId(props, id) };
  return useSelector(
    (state) => fieldSelector(state, props, field, resolved),
    options.equalityFn
  );
};


// Accepts BaselineProps (system scope) or RuntimeProps (component/storage scope).
// Polymorphic: branches on field.scope to access different properties.
// TODO: Consider splitting into updateSystemField / updateComponentField for type safety.
export function updateField(
  props: BaselineProps | null,
  field: FieldInfo,
  newValue,
  { id, tag }: { id?: ReduxStateKey | boolean; tag?: string | boolean } = {}
) {
  assertValidField(field);
  // Validate/coerce value against field schema if defined.
  // TODO: For authored content (SetFieldAction etc.), this throws a ZodError on invalid values
  // (e.g. value="banana" for a boolean field). Fine for coding errors (fail fast), but for
  // content authoring we should validate earlier with user-friendly errors rather than crashing
  // action execution at runtime. Revisit when moving beyond pilot.
  if (field.schema) {
    newValue = field.schema.parse(newValue);
  }
  const scope = field.scope;
  const fieldName = field.name;
  // If id is a ReduxStateKey, use it directly (cross-component access).
  // Otherwise, resolve the component's own ID from props.
  const resolvedId = (scope === scopes.component || scope === scopes.storage)
    ? (typeof id === 'string'
      ? id
      : idResolver.refToReduxKey(props as RuntimeProps))
    : undefined;
  const resolvedTag = tag ?? (props as RuntimeProps)?.loBlock?.OLXName;

  const logEvent = props ? props.runtime.logEvent : lo_event.logEvent;
  logEvent(field.event, {
    scope,
    [fieldName]: newValue,
    ...(scope === scopes.component || scope === scopes.storage ? { id: resolvedId } : {}),
    ...(scope === scopes.componentSetting ? { tag: resolvedTag } : {})
  });
}


export function useFieldState(
  props: BaselineProps | null,
  field: FieldInfo,
  fallback?,
  { id, tag }: { id?: OlxReference | boolean; tag?: string | boolean } = {}
) {
  assertValidField(field);

  // useFieldSelector handles OlxKey → ReduxStateKey conversion for reading
  const value = useFieldSelector(props, field, { fallback, id, tag });

  // For writing, resolve the ReduxStateKey once
  const reduxId = resolveOlxId(props, id);
  const ref = useRef({ props, field, id: reduxId, tag });
  ref.current = { props, field, id: reduxId, tag };
  const setValue = useCallback(
    (newValue) => {
      const { props, field, id, tag } = ref.current;
      updateField(props, field, newValue, { id, tag });
    },
    []
  );

  return [value, setValue];
}

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
  ids: string[],
  { fallback, tag, aggregate = 'list' }: ReduxAggregateOptions<T, R> = {}
) {
  assertValidField(field);

  return useSelector(
    (state) => {
      const values = ids.map((rawId) =>
        fieldSelector(state, props, field, { fallback, id: resolveOlxId(props, rawId as OlxKey), tag }),
      );

      if (typeof aggregate === 'function') {
        return aggregate(values, ids);
      }

      if (aggregate === 'object') {
        return Object.fromEntries(ids.map((id, index) => [id, values[index]]));
      }

      return values;
    },
    shallowEqual,
  );
}


/*
 * Helpers for component types.
 */

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

  const id = idResolver.refToReduxKey(props);
  const tag = props.loBlock.OLXName;
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
  opts: { id?: OlxKey; tag?: string } = {}
) {
  assertValidField(field);
  const [checked, setChecked] = useFieldState(props, field, fallback, opts);
  const onChange = useCallback((event) => setChecked(event.target.checked), [setChecked]);
  return [checked, { name: field.name, checked, onChange }];
}

/**
 * Helper to get a field from another component by string name.
 * Throws if the component or field is not found to prevent typos.
 *
 * Note that this should only be used when field names are coming
 * from user input (e.g. OLX files). Otherwise, we should treat
 * fields as if they were an enum or symbol, and only use as
 * `fields.field`
 *
 * @param {Object} props - Component props with blockRegistry and olxJsonSources
 * @param {string} targetId - ID of the target component
 * @param {string} fieldName - Name of the field to access (e.g., 'value')
 * @returns {FieldInfo} The field info
 * @throws {Error} If component or field not found
 */
export function componentFieldByName(props: RuntimeProps, targetId: OlxKey | ReduxStateKey, fieldName: string) {
  // Normalize to OlxKey: handles both bare OlxKey (unchanged) and scoped ReduxStateKey (extracts leaf)
  const normalizedId = idResolver.reduxKeyToOlxKey(targetId as ReduxStateKey);
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale.code;
  const targetNode = selectBlock(props.runtime.store.getState(), sources, normalizedId, locale);
  if (!targetNode) {
    throw new Error(`Could not find component "${targetId}". Check that the id exists in your OLX and is spelled correctly.`);
  }

  const targetLoBlock = props.runtime.blockRegistry[targetNode.tag];
  if (!targetLoBlock) {
    throw new Error(`Unknown component type <${targetNode.tag}>. This tag is not registered as a block.`);
  }

  const field = targetLoBlock.fields?.[fieldName];
  if (!field) {
    const availableFields = Object.keys(targetLoBlock.fields || {});
    throw new Error(`<${targetNode.tag} id="${targetId}"> has no "${fieldName}" field. Available fields: ${availableFields.join(', ') || 'none'}`);
  }

  return field;
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
 * Reconstruct a component's RuntimeProps from its OlxJson node and blueprint.
 *
 * Used when we need a component's own props outside of its render tree
 * (e.g., calling selectValue from valueSelector). Looks up the component's
 * OlxDomNode by ReduxStateKey for correct runtime context (idPrefix, logEvent).
 *
 * Falls back to caller's runtime if the target hasn't been rendered yet.
 *
 * Note: This is a minimal reconstruction — it includes id, attributes, kids,
 * loBlock, fields, locals, and runtime, which is sufficient for selectValue.
 * It does NOT include injected props like extraDebug that the render pipeline
 * adds. If future callers need fuller props, this should be expanded.
 */
export function propsForNode(callerProps: RuntimeProps, reduxKey: ReduxStateKey, node: OlxJson, loBlock: LoBlock) {
  const domNode = callerProps.nodeInfo
    ? getDomNodeByReduxKey(callerProps, reduxKey)
    : null;

  const runtime = domNode?.runtime ?? callerProps.runtime;
  return {
    ...node.attributes,
    id: node.id,
    kids: node.kids ?? [],
    loBlock,
    fields: loBlock.fields,
    locals: loBlock.locals,
    runtime,
    nodeInfo: domNode ?? callerProps.nodeInfo,
    idPrefix: runtime.idPrefix,
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
  reduxKey: ReduxStateKey | null | undefined,
  { fallback = '' } = {} as { fallback?: any }
): BlockDataResult & { value: any } {
  if (reduxKey === undefined || reduxKey === null) {
    return { value: fallback, ...blockData('ready') };
  }

  // ReduxStateKey → OlxKey for content store lookup
  const mapKey = idResolver.reduxKeyToOlxKey(reduxKey);
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale.code;
  const targetNode = selectBlock(state, sources, mapKey, locale);
  const loBlock = targetNode ? props.runtime.blockRegistry[targetNode.tag] : null;

  if (!targetNode || !loBlock) {
    const bs = selectBlockState(state, sources, mapKey);
    if (bs?.loadingState?.status === 'error') {
      return { value: fallback, ...blockData('error', bs.error?.message ?? `Block "${reduxKey}" not found`) };
    }
    return { value: fallback, ...blockData('loading') };
  }

  if (loBlock.selectValue) {
    const targetProps = propsForNode(props, reduxKey, targetNode, loBlock);

    if ((loBlock.selectValue as any)[RETURNS_BLOCK_DATA]) {
      return loBlock.selectValue(targetProps, state, reduxKey);
    }

    return { value: loBlock.selectValue(targetProps, state, reduxKey), ...blockData('ready') };
  }

  // Fall back to direct field access using the common 'value' field
  return { value: fieldSelector(state, props, commonFields.value, { id: reduxKey, fallback }), ...blockData('ready') };
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
    reduxKey,
    target,
    fallback,
  }: {
    reduxKey?: ReduxStateKey | null;
    target?: OlxReference | null;
    fallback?: any;
  } = {}
): BlockDataResult & { value: any } {
  // Priority: explicit reduxKey > target (resolved) > own component
  const resolvedKey: ReduxStateKey | null =
    reduxKey !== undefined ? reduxKey
    : target !== undefined ? (target ? idResolver.refToReduxKey({ ...props, id: target }) as ReduxStateKey : null)
    : idResolver.refToReduxKey(props);

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
      ensureBlock(props, idResolver.reduxKeyToOlxKey(resolvedKey), source);
    }
  }, [resolvedKey, result.status, source, sideEffectFree]);

  return result;
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
  reduxKey: ReduxStateKey,
  { scope = scopes.component }: { scope?: string } = {}
) {
  return useSelector(
    (state: any) => state?.application_state?.[scope]?.[reduxKey] || null,
    shallowEqual
  );
}
