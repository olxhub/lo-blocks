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
// - `updateReduxField`: Update state and trigger analytics logging
// - `useReduxInput`: Complete form control integration with selection state
// - `fieldSelector`: Core selector logic for different state scopes
//
// The system bridges the educational semantics (fields, scopes, analytics)
// with standard React patterns, making it easy for block developers to
// build stateful learning components.
//
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';

import * as lo_event from 'lo_event';

import * as idResolver from '../blocks/idResolver';
import { fieldByName } from './fields';

import { scopes } from '../state/scopes';
import { FieldInfo } from '../types';
import { assertValidField } from './fields';


const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import
const INVALIDATED_INPUT = 'INVALIDATED_INPUT'; // informational


export interface SelectorOptions<T> {
  id?: string;
  tag?: string;
  selector?: (state) => T;
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
}


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
        const tag =
          optTag ??
          props?.blueprint?.OLXName ??
          props.nodeInfo?.node?.tag;
        return selector(scopedState?.[tag]);
      }
      case scopes.system:
        return selector(scopedState);
      case scopes.storage:
      case scopes.component: {
        const id = optId ?? idResolver.reduxId(props);
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
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): T => {
  const state = reduxLogger.store.getState();
  return fieldSelector(state, undefined, field, options);
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


export function updateReduxField(
  props,
  field: FieldInfo,
  newValue,
  { id, tag }: { id?: string; tag?: string } = {}
) {
  assertValidField(field);
  const scope = field.scope;
  const fieldName = field.name;
  const resolvedId = id ?? (scope === scopes.component ? idResolver.reduxId(props) : undefined);
  const resolvedTag = tag ?? props?.blueprint?.OLXName;

  lo_event.logEvent(field.event, {
    scope,
    [fieldName]: newValue,
    ...(scope === scopes.component || scope === scopes.storage ? { id: resolvedId } : {}),
    ...(scope === scopes.componentSetting ? { tag: resolvedTag } : {})
  });
}


export function useReduxState(
  props,
  field: FieldInfo,
  fallback,
  { id, tag }: { id?: string; tag?: string } = {}
) {
  assertValidField(field);

  const value = useFieldSelector(props, field, { fallback, id, tag });

  const setValue = (newValue) => updateReduxField(props, field, newValue, { id, tag });

  return [value, setValue];
}


/*
 * Helpers for component types.
 */

type ReduxInputOptions = {
  updateValidator?: (val: string) => boolean;
};


export function useReduxInput(
  props,
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

  const id = idResolver.reduxId(props);
  const tag = props?.blueprint.OLXName;

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
      lo_event.logEvent(INVALIDATED_INPUT, payload);
      return;
    }

    lo_event.logEvent(UPDATE_INPUT, payload);
  }, [id, tag, fieldName, updateValidator, scope]);

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
  opts: { id?: string; tag?: string } = {}
) {
  assertValidField(field);
  const [checked, setChecked] = useReduxState(props, field, fallback, opts);
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
 * @param {Object} props - Component props with idMap and componentMap
 * @param {string} targetId - ID of the target component
 * @param {string} fieldName - Name of the field to access (e.g., 'value')
 * @returns {FieldInfo} The field info
 * @throws {Error} If component or field not found
 */
export function componentFieldByName(props, targetId, fieldName) {
  // TODO: Flip around. If x not in y: raise exception. Then grab it.
  // TODO: More human-friendly errors. This is for programmers, but teachers might see these editing.
  // Possible TODO: Extract context from props for human-friendly errors.
  // Possible TODO: Move to OLXDom or similar. I'm not sure this is the best place for this.
  // Optimization: In production, we could go directly into the global field name maps. But this is better for dev + editing. The global map risks referencing a field which exists in the system, but not in the target component.

  const targetNode = props.idMap?.[targetId];
  if (!targetNode) {
    throw new Error(`componentFieldByName: Component "${targetId}" not found in idMap`);
  }

  const targetBlueprint = props.componentMap?.[targetNode.tag];
  if (!targetBlueprint) {
    throw new Error(`componentFieldByName: No blueprint found for component type "${targetNode.tag}"`);
  }

  const field = targetBlueprint.blueprint.fields.fieldInfoByField?.[fieldName];
  if (!field) {
    const availableFields = Object.keys(targetBlueprint.blueprint.fields.fieldInfoByField || {});
    throw new Error(`componentFieldByName: Field "${fieldName}" not found in component "${targetId}" (${targetNode.tag}). Available fields: ${availableFields.join(', ')}`);
  }

  return field;
}

/**
 * Selector function to get a component's value by ID.
 * Tries getValue method first, falls back to direct field access.
 *
 * @param {Object} props - Component props with idMap and componentMap
 * @param {Object} state - Redux state
 * @param {string} id - ID of the component to get value from
 * @param {Object} options - Options object with fallback and other settings
 * @returns {any} The component's current value
 */
export function valueSelector(props, state, id, { fallback } = {} as { fallback?: any }) {
  const targetNode = props?.idMap?.[id];
  if (!targetNode) {
    return fallback;
  }

  const blueprint = props?.componentMap?.[targetNode.tag];
  if (!blueprint) {
    return fallback;
  }

  // Try getValue first (for computed values like wordcount)
  if (blueprint.getValue) {
    try {
      return blueprint.getValue(props, state, id);
    } catch (e) {
      // Fall through to field access on error
      console.warn(`getValue failed for ${id}: ${e.message}`);
    }
  }

  // Fall back to direct field access using the 'value' field
  const valueField = fieldByName('value');
  if (!valueField) {
    console.warn(`Field 'value' not registered in system`);
    return fallback;
  }

  return fieldSelector(state, { ...props, id }, valueField, { fallback });
}

/**
 * React hook to get a component's value by ID with automatic re-rendering.
 *
 * @param {Object} props - Component props with idMap and componentMap
 * @param {string} id - ID of the component to get value from
 * @param {Object} options - Options object with fallback and other settings
 * @returns {any} The component's current value
 */
export function useValue(props, id, options = {}) {
  return useSelector((state) => valueSelector(props, state, id, options));
}
