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
import { FieldInfo, OlxReference, OlxKey } from '../types';
import { assertValidField } from './fields';
import { selectBlock } from './olxjson';


const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import
const INVALIDATED_INPUT = 'INVALIDATED_INPUT'; // informational


export interface SelectorOptions<T> {
  id?: string | boolean;
  tag?: string | boolean;
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
          props?.loBlock?.OLXName ??
          props.nodeInfo?.node?.tag;
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
  { id, tag }: { id?: string | boolean; tag?: string | boolean } = {}
) {
  assertValidField(field);
  const scope = field.scope;
  const fieldName = field.name;
  // If id override is provided, apply prefix via refToReduxKey (supports /absolute syntax)
  // Otherwise, use the component's own ID from props
  const resolvedId = (scope === scopes.component || scope === scopes.storage)
    ? (id !== undefined
      ? idResolver.refToReduxKey({ ...props, id })
      : idResolver.refToReduxKey(props))
    : undefined;
  const resolvedTag = tag ?? props?.loBlock?.OLXName;

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
  { id, tag }: { id?: string | boolean; tag?: string | boolean } = {}
) {
  assertValidField(field);

  const value = useFieldSelector(props, field, { fallback, id, tag });

  const setValue = (newValue) => updateReduxField(props, field, newValue, { id, tag });

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
 * This mirrors `useReduxState`'s read-path but aggregates the values from
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

  const id = idResolver.refToReduxKey(props);
  const tag = props?.loBlock.OLXName;

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
 * @param {Object} props - Component props with blockRegistry and olxJsonSources
 * @param {string} targetId - ID of the target component
 * @param {string} fieldName - Name of the field to access (e.g., 'value')
 * @returns {FieldInfo} The field info
 * @throws {Error} If component or field not found
 */
export function componentFieldByName(props, targetId: OlxReference, fieldName: string) {
  // TODO: More human-friendly errors. This is for programmers, but teachers might see these editing.
  // Possible TODO: Move to OLXDom or similar. I'm not sure this is the best place for this.

  // Use refToOlxKey to normalize the ID for Redux lookup
  const normalizedId = idResolver.refToOlxKey(targetId);
  const sources = props.olxJsonSources ?? ['content'];
  const targetNode = selectBlock(reduxLogger.store?.getState(), sources, normalizedId);
  if (!targetNode) {
    throw new Error(`componentFieldByName: Component "${targetId}" not found in content`);
  }

  const targetLoBlock = props.blockRegistry?.[targetNode.tag];
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
export function valueSelector(props, state, id: OlxReference | null | undefined, { fallback } = {} as { fallback?: any }) {
  // If no ID provided, return fallback (supports optional targetRef patterns)
  if (id === undefined || id === null) {
    return fallback;
  }

  // Use refToOlxKey to strip prefixes for Redux lookup
  const mapKey = idResolver.refToOlxKey(id);
  const sources = props?.olxJsonSources ?? ['content'];
  const targetNode = selectBlock(reduxLogger.store?.getState(), sources, mapKey);
  const loBlock = targetNode ? props.blockRegistry?.[targetNode.tag] : null;

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

  // Try getValue first (for computed values like wordcount)
  if (loBlock.getValue) {
    return loBlock.getValue(props, state, id);
  }

  // Fall back to direct field access using the 'value' field
  const valueField = fieldByName('value');
  if (!valueField) {
    throw new Error(
      `valueSelector: MAJOR MISCONFIGURATION - 'value' field not registered in system\n` +
      `  This indicates a critical system setup issue that must be fixed`
    );
  }

  return fieldSelector(state, props, valueField, { id, fallback });
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
