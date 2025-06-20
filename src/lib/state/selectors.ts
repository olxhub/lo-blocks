// src/lib/state/selectors.ts
'use client';
//
// This file supercedes and obsoletes selectors.ts in lo_assess, which should eventually be removed.

import { useSelector, shallowEqual } from 'react-redux';
import { useRef, useEffect, useCallback } from 'react';
import * as idResolver from '../blocks/idResolver';

import * as lo_event from 'lo_event';
import { FieldInfo } from '../types';
import { scopes } from './scopes';

const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import
const INVALIDATED_INPUT = 'INVALIDATED_INPUT'; // informational

// Unified options type
export interface SelectorOptions<T = any> {
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
  // Consider adding: [key: string]: any; // For future Redux or custom extensions
}
export type SelectorExtraParam<T = any> = SelectorOptions<T> | ((a: T, b: T) => boolean);

export interface FieldSelectorOptions<T = any> extends SelectorOptions<T> {
  id?: string;
  tag?: string;
}

// --- Normalize options
function normalizeOptions<T = any>(arg?: SelectorExtraParam<T>): SelectorOptions<T> {
  if (arg === undefined) return {};
  if (typeof arg === 'function') return { equalityFn: arg };
  if (typeof arg === 'object') return arg;
  throw new Error(`[selectors] Invalid selector options: ${arg}`);
}

// --- Selectors ---

export function useApplicationSelector<T = any>(
  selector: (state: any) => T = s => s,
  options?: SelectorExtraParam<T>
): T {
  const { fallback, ...rest } = normalizeOptions(options);
  return useSelector(
    state => {
      const val = selector(state?.application_state);
      return val !== undefined ? val : fallback;
    },
    rest.equalityFn,
  );
}

/** @deprecated use `useFieldSelector` instead */
export function useComponentSelector<T = any>(
  id: string | Record<string, any>,
  selector: (state: any) => T = s => s,
  options?: SelectorExtraParam<T>
): T {
  return useApplicationSelector(
    s => selector(s?.component_state?.[id]),
    options
  );
}

export function useFieldSelector<T = any>(
  props: any,  // TODO: Change to props type
  field: FieldInfo,
  selector: (state: any) => T = s => s,
  options?: FieldSelectorOptions<T>
): T {
  const { id: optId, tag: optTag, ...rest } = normalizeOptions(options);
  const scope = field.scope; // Default of scopes.component is handled in field creation
  const id =
    scope === scopes.component
      ? optId ?? idResolver.reduxId(props)
      : optId;
  const tag =
    optTag ??
    props?.blueprint?.OLXName ??
    props.nodeInfo?.node?.tag;

  switch (scope) {
    case scopes.componentSetting:
      return useApplicationSelector(
        s => selector(s?.componentSetting_state?.[tag]),
        rest
      );
    case scopes.system:
      return useApplicationSelector(
        s => selector(s?.settings_state),
        rest
      );
    case scopes.storage:
      return useApplicationSelector(
        s => selector(s?.storage_state?.[id]),
        rest
      );
    case scopes.component:
    default:
      return useApplicationSelector(
        s => selector(s?.component_state?.[id]),
        rest
      );
  }
}

// TODO: We should figure out where this goes.
//
// This should use redux.assertValidField, but we want to be mindful
// of circular imports, etc.

export function useReduxInput(
  props,
  field: FieldInfo,
  fallback = '',
  { updateValidator } = {}
) {
  const scope = field.scope ?? scopes.component;
  const fieldName = field.name;

  const selectorFn = (state: any) =>
    state && state[fieldName] !== undefined ? state[fieldName] : fallback;

  const value = useFieldSelector(props, field, selectorFn, { fallback });

  const selection = useFieldSelector(
    props,
    field,
    s => ({
      selectionStart: s?.[`${fieldName}.selectionStart`] ?? 0,
      selectionEnd: s?.[`${fieldName}.selectionEnd`] ?? 0
    }),
    { equalityFn: shallowEqual }
  );

  const id = idResolver.reduxId(props);
  const tag = props?.blueprint.OLXName;

  const onChange = useCallback((event) => {
    const val = event.target.value;
    const selStart = event.target.selectionStart;
    const selEnd = event.target.selectionEnd;
    const payload: any = {
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

  const ref = useRef();

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

// Export internals for test
export const __testables = {
  normalizeOptions
};
