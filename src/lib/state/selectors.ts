// src/lib/state/selectors.ts
'use client';
//
// This file supercedes and obsoletes selectors.ts in lo_assess, which should eventually be removed.

import { useSelector, shallowEqual } from 'react-redux';
import { useRef, useEffect, useCallback } from 'react';

import * as lo_event from 'lo_event';

const UPDATE_INPUT = 'UPDATE_INPUT'; // TODO: Import
const INVALIDATED_INPUT = 'INVALIDATED_INPUT'; // informational

// Unified options type
export interface SelectorOptions<T = any> {
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
  // Consider adding: [key: string]: any; // For future Redux or custom extensions
}
export type SelectorExtraParam<T = any> = SelectorOptions<T> | ((a: T, b: T) => boolean);

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

// TODO: We should figure out where this goes.
//
// This should use redux.assertValidField, but we want to be mindful
// of circular imports, etc.
export function useReduxInput(
  props,
  field: { name: string },
  fallback = '',
  { updateValidator } = {}
) {
  const id = props?.id;
  const fieldName = field.name;
  const value = useComponentSelector(id, state =>
    state && state[fieldName] !== undefined ? state[fieldName] : fallback
  );

  const selection = useComponentSelector(
    id,
    state => ({
      selectionStart: state?.[`${fieldName}.selectionStart`] ?? 0,
      selectionEnd: state?.[`${fieldName}.selectionEnd`] ?? 0
    }),
    shallowEqual
  );

  const onChange = useCallback((event) => {
    const val = event.target.value;
    const selStart = event.target.selectionStart;
    const selEnd = event.target.selectionEnd;
    if (updateValidator && !updateValidator(val)) {
      lo_event.logEvent(INVALIDATED_INPUT, {
        id,
        [fieldName]: val,
        [`${fieldName}.selectionStart`]: selStart,
        [`${fieldName}.selectionEnd`]: selEnd
      });
      return;
    }

    lo_event.logEvent(UPDATE_INPUT, {
      id,
      [fieldName]: val,
      [`${fieldName}.selectionStart`]: selStart,
      [`${fieldName}.selectionEnd`]: selEnd
    });
  }, [id, fieldName, updateValidator]);

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
