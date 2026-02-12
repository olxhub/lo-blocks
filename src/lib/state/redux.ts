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
import { FieldInfo, OlxReference, OlxKey, RuntimeProps, BaselineProps } from '../types';
import { assertValidField } from './fields';
import type { Store } from 'redux';
import { selectBlock } from './olxjson';
import { getAllNodes } from '../blocks/olxdom';
import { getReduxStoreInstance } from './store';


const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import
const INVALIDATED_INPUT = 'INVALIDATED_INPUT'; // informational


export interface SelectorOptions<T> {
  id?: string | boolean;
  tag?: string | boolean;
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
        // If optId is provided, apply prefix via refToReduxKey (supports /absolute syntax)
        // Otherwise, use the component's own ID from props
        const id = optId !== undefined
          ? idResolver.refToReduxKey({ ...props, id: optId })
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
  { id, tag }: { id?: OlxKey | boolean; tag?: string | boolean } = {}
): any => {
  assertValidField(field);

  const store = getReduxStoreInstance();
  const state = store.getState();
  return fieldSelector(state, props, field, { fallback, id, tag });
};

/** React-friendly wrapper that forwards any equalityFn from options. */
export const useFieldSelector = <T>(
  props: any,               // TODO: narrow when convenient
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): T =>
  useSelector(
    (state) => fieldSelector(state, props, field, options),
    options.equalityFn
  );


// Accepts BaselineProps (system scope) or RuntimeProps (component/storage scope).
// Polymorphic: branches on field.scope to access different properties.
// TODO: Consider splitting into updateSystemField / updateComponentField for type safety.
export function updateField(
  props: BaselineProps | null,
  field: FieldInfo,
  newValue,
  { id, tag }: { id?: OlxKey | boolean; tag?: string | boolean } = {}
) {
  assertValidField(field);
  const scope = field.scope;
  const fieldName = field.name;
  // For component/storage scope, resolve the ID for Redux state key.
  // These scopes require RuntimeProps (with id/idPrefix) for resolution.
  const resolvedId = (scope === scopes.component || scope === scopes.storage)
    ? (typeof id === 'string'
      ? idResolver.refToReduxKey({ ...(props as RuntimeProps), id })
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
  { id, tag }: { id?: OlxKey | boolean; tag?: string | boolean } = {}
) {
  assertValidField(field);

  const value = useFieldSelector(props, field, { fallback, id, tag });

  // Stable setter (like useState): ref holds latest args so the callback
  // identity never changes, safe to use in useEffect deps.
  const ref = useRef({ props, field, id, tag });
  ref.current = { props, field, id, tag };
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
      const values = ids.map((id) =>
        fieldSelector(state, props, field, { fallback, id, tag }),
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
export function componentFieldByName(props: RuntimeProps, targetId: OlxReference, fieldName: string) {
  // TODO: More human-friendly errors. This is for programmers, but teachers might see these editing.
  // Possible TODO: Move to OLXDom or similar. I'm not sure this is the best place for this.

  // Use refToOlxKey to normalize the ID for Redux lookup
  const normalizedId = idResolver.refToOlxKey(targetId);
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale.code;
  const targetNode = selectBlock(props.runtime.store.getState(), sources, normalizedId, locale);
  if (!targetNode) {
    throw new Error(`componentFieldByName: Component "${targetId}" not found in content`);
  }

  const targetLoBlock = props.runtime.blockRegistry[targetNode.tag];
  if (!targetLoBlock) {
    throw new Error(`componentFieldByName: No LoBlock found for component type "${targetNode.tag}"`);
  }

  const field = targetLoBlock.fields?.[fieldName];
  if (!field) {
    const availableFields = Object.keys(targetLoBlock.fields || {});
    throw new Error(`componentFieldByName: Field "${fieldName}" not found in component "${targetId}" (${targetNode.tag}). Available fields: ${availableFields.join(', ')}`);
  }

  return field;
}

/**
 * Selector function to get a component's value by ID.
 * Tries getValue method first, falls back to direct field access.
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
 * (e.g., calling getValue from valueSelector). Looks up the component's
 * OlxDomNode for correct runtime context (idPrefix, logEvent).
 *
 * Falls back to the caller's runtime if the target hasn't been rendered yet.
 * This is wrong (wrong idPrefix, wrong logEvent context) but currently
 * unavoidable for components that haven't mounted. Callers that need
 * accurate runtime should ensure the target has rendered first.
 */
export function propsForNode(callerProps: RuntimeProps, node: any, loBlock: any) {
  const domNode = callerProps.nodeInfo
    ? getAllNodes(callerProps.nodeInfo, { selector: n => n.node?.id === node.id })[0] ?? null
    : null;

  // TODO: runtime/nodeInfo fallbacks are incorrect — they use the caller's
  // context, not the target's. Works when both share the same idPrefix
  // (common case) but will break for cross-scope references.
  return {
    ...node.attributes,
    id: node.id,
    kids: node.kids,
    loBlock,
    fields: loBlock.fields,
    locals: loBlock.locals,
    runtime: domNode?.runtime ?? callerProps.runtime,
    nodeInfo: domNode ?? callerProps.nodeInfo,
  };
}

export function valueSelector(props: RuntimeProps, state: any, id: OlxReference | null | undefined, { fallback } = {} as { fallback?: any }) {
  // If no ID provided, return fallback (supports optional targetRef patterns)
  if (id === undefined || id === null) {
    return fallback;
  }

  // Use refToOlxKey to strip prefixes for Redux lookup
  const mapKey = idResolver.refToOlxKey(id);
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale.code;
  const targetNode = selectBlock(props.runtime.store.getState(), sources, mapKey, locale);
  const loBlock = targetNode ? props.runtime.blockRegistry[targetNode.tag] : null;

  if (!targetNode || !loBlock) {
    const missing: string[] = [];
    if (!targetNode) missing.push('targetNode');
    if (!loBlock) missing.push('loBlock');

    throw new Error(
      `valueSelector: Missing ${missing.join(' and ')} for component id "${id}"` +
      (id !== mapKey ? ` (olxKey: "${mapKey}")` : '') + `\n` +
      `  targetNode: ${!!targetNode}\n` +
      `  loBlock: ${!!loBlock}`
    );
  }

  if (loBlock.getValue) {
    const targetProps = propsForNode(props, targetNode, loBlock);
    return loBlock.getValue(targetProps, state, id);
  }

  // Fall back to direct field access using the common 'value' field
  return fieldSelector(state, props, commonFields.value, { id, fallback });
}

/**
 * React hook to get a component's value by ID with automatic re-rendering.
 *
 * @param {Object} props - Component props with blockRegistry and olxJsonSources
 * @param {string} id - ID of the component to get value from
 * @param {Object} options - Options object with fallback and other settings
 * @returns {any} The component's current value
 */
export function useValue(props, id, options = {}) {
  return useSelector((state) => valueSelector(props, state, id, options));
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
  targetId: OlxReference,
  { scope = scopes.component }: { scope?: string } = {}
) {
  const resolvedId = idResolver.refToReduxKey({ ...props, id: targetId });

  return useSelector(
    (state: any) => state?.application_state?.[scope]?.[resolvedId] || null,
    shallowEqual
  );
}
