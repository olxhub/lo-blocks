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


export interface SelectorOptions<T> {
  id?: string;
  tag?: string;
  selector?: (state) => T;
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
}

// --- Selectors ---
export function useFieldSelector<T>(
  props,  // TODO: Change to props type
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): T {
  // HACK. Selector should run over s.?[field], but it's part of our code migration.
  const { id: optId, tag: optTag, fallback, selector = (s: any) => s?.[field.name], ...rest } = options;
  const scope = field.scope; // Default of scopes.component is handled in field creation

  // HACK: Clean up the lines below. This code works, but is slightly wrong.
  //
  // This was added since blueprint was sometimes missing (perhaps due to server-side
  // rendering? But if so, why did it work otherwise? The bug manifested only in the
  // componentSetting scope). reduxId was also sometimes failing. Perhaps these belong
  // inside the switch statement?
  //
  // But it's worth figuring out what's going on, if it doesn't get fixed via refactors.
  //
  // We should figure out:
  // - Are we losing anything nonserializable in AJAX calls?
  // - Is blueprint coming from the right canonical source in render() (probably
  //   componentMap[tag])
  const id =
    scope === scopes.component
      ? optId ?? idResolver.reduxId(props)
      : optId;
  const tag =
    optTag ??
    props?.blueprint?.OLXName ??
    props.nodeInfo?.node?.tag;
  return useSelector(
    state => {
      const s = state?.application_state;
      let val;
      switch (scope) {
        case scopes.componentSetting:
          val = selector(s?.componentSetting_state?.[tag]);
          break;
        case scopes.system:
          val = selector(s?.settings_state);
          break;
        case scopes.storage:
          val = selector(s?.storage_state?.[id]);
          break;
        case scopes.component:
          val = selector(s?.component_state?.[id]);
          break;
        default:
          throw Error("Unrecognized scope");
      }
      return val !== undefined ? val : fallback;
    },
    rest
  );
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
};
