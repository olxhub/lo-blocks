// src/lib/state/redux.ts
import * as lo_event from 'lo_event';
import * as idResolver from '../blocks/idResolver';

import { useComponentSelector, useFieldSelector } from './selectors.ts';
import { useCallback } from 'react';
import { Scope, scopes } from '../state/scopes';
import { FieldInfo, FieldInfoByEvent, FieldInfoByField } from '../types';

const _fieldInfoByField: FieldInfoByField = {};
const _fieldInfoByEvent: FieldInfoByEvent = {};

/**
 * Converts a camelCase or PascalCase field name into a default event name string.
 *
 * Note this is only a default. We may handle some things differently
 * (mostly in the case of complex, adjecent acronyms; if we e.g. had
 * JSONSQLXMLTransmogifier for whatever reason)
 * 
 * Example:
 *   fieldNameToDefaultEventName('fieldName')      // returns 'UPDATE_FIELD_NAME'
 */
function fieldNameToDefaultEventName(name) {
  return (
    'UPDATE_' +
    name
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')

      .toUpperCase()
  );
}

/**
 * Checks for conflicts between two field<->event mapping objects.
 * Throws if a key maps to a different value in each map.
 *
 * @param {Object} globalMap - The persistent global mapping.
 * @param {Object} newMap - The new mapping to check.
 * @param {string} type - A string label for error clarity ("field" or "event").
 */
function checkConflicts(globalMap: FieldInfoByField | FieldInfoByEvent, newMap: FieldInfoByField | FieldInfoByEvent, type = "field") {
  for (const [key, value] of Object.entries(newMap)) {
    if (globalMap.hasOwnProperty(key)) {
      const existing = globalMap[key];
      if (
        existing.name !== value.name ||
        existing.event !== value.event ||
        existing.scope !== value.scope
      ) {
        throw new Error(
          `[fields] Conflicting ${type} registration: "${key}" was previously mapped to "${JSON.stringify(existing)}", but attempted to map to "${JSON.stringify(value)}".`
        );
      }
    }
  }
}

export function concatFields(...lists) {
  const fieldInfoByField = {};
  const fieldInfoByEvent = {};
  for (const list of lists) {
    Object.assign(fieldInfoByField, list.fieldInfoByField);
    Object.assign(fieldInfoByEvent, list.fieldInfoByEvent);
  }
  return { fieldInfoByField, fieldInfoByEvent };
}

export function fields(fieldList: (string | { name: string; event?: string; scope?: Scope })[]) {
  const infos: FieldInfo[] = fieldList.map(item => {
    if (typeof item === 'string') {
      return { type: 'field', name: item, event: fieldNameToDefaultEventName(item), scope: scopes.component };
    }
    const name = item.name;
    const event = item.event ?? fieldNameToDefaultEventName(name);
    const scope = item.scope ?? scopes.component;
    return { type: 'field', name, event, scope };
  });

  const fieldInfoByField: FieldInfoByField = {};
  const fieldInfoByEvent: FieldInfoByEvent = {};

  for (const info of infos) {
    fieldInfoByField[info.name] = info;
    fieldInfoByEvent[info.event] = info;
  }

  checkConflicts(_fieldInfoByField, fieldInfoByField, "field");
  checkConflicts(_fieldInfoByEvent, fieldInfoByEvent, "event");

  Object.assign(_fieldInfoByField, fieldInfoByField);
  Object.assign(_fieldInfoByEvent, fieldInfoByEvent);

  const result = {
    fieldInfoByField,
    fieldInfoByEvent,
  };

  Object.defineProperty(result, 'extend', {
    value: (...rest: ReduxFieldsReturn[]) => concatFields(result, ...rest),
    enumerable: false,
  });

  return result;
}

export function assertValidField(field) {
  if (!field || field.type !== 'field') {
    throw new Error(`[fields] Invalid field: ${field}`);
  };

  if (!_fieldInfoByField.hasOwnProperty(field.name)) {
    throw new Error(`[fields] Invalid field name: ${field.name}`);
  }
  return field; // optionally return the field for chaining
}

export function updateReduxField(
  props,
  field: FieldInfo,
  newValue,
  { id, tag }: { id?: string; tag?: string } = {}
) {
  assertValidField(field);
  const scope = field.scope ?? scopes.component;
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

  const value = useFieldSelector(props, field, s => s?.[field.name], { fallback, id, tag });

  const setValue = (newValue) => updateReduxField(props, field, newValue, { id, tag });

  return [value, setValue];
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

/** @internal Used only for testing */
export const __testables = {
  fieldNameToDefaultEventName,
  reset: () => {
    Object.keys(_fieldInfoByField).forEach(k => delete _fieldInfoByField[k]);
    Object.keys(_fieldInfoByEvent).forEach(k => delete _fieldInfoByEvent[k]);
  }
};
