// src/lib/state/redux.ts
import * as lo_event from 'lo_event';
import * as idResolver from '../blocks/idResolver';

import { useComponentSelector, useFieldSelector } from './selectors.ts';
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
  if (!_fieldInfoByField.hasOwnProperty(field)) {
    throw new Error(`Invalid field: ${field}`);
  }
  return field; // optionally return the field for chaining
}

export function useReduxState(
  props,
  field: FieldInfo,
  fallback
) {
  const scope = field.scope ?? scopes.component;
  const fieldName = field.name;

  const selectorFn = (state) => {
    if (!state) return fallback;
    return state[fieldName] !== undefined ? state[fieldName] : fallback;
  };

  const value = useFieldSelector(props, field, selectorFn, { fallback });

  const id = scope === scopes.component ? idResolver.reduxId(props?.id) : undefined;
  const tag = props?.blueprint?.OLXName;

  const setValue = (newValue) => {
    const eventType = field.event;
    lo_event.logEvent(eventType, {
      scope,
      [fieldName]: newValue,
      ...(scope === scopes.component ? { id } : {}),
      ...(scope === scopes.componentSetting ? { tag } : {})
    });
  };

  return [value, setValue];
}

/** @internal Used only for testing */
export const __testables = {
  fieldNameToDefaultEventName,
  reset: () => {
    Object.keys(_fieldInfoByField).forEach(k => delete _fieldInfoByField[k]);
    Object.keys(_fieldInfoByEvent).forEach(k => delete _fieldInfoByEvent[k]);
  }
};
