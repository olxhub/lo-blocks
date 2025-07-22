// src/lib/state/redux.ts
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';

import * as lo_event from 'lo_event';

import * as idResolver from '../blocks/idResolver';

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
