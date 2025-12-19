// src/lib/state/fields.ts
//
// Field definition system - declarative state management for Learning Observer blocks.
//
// CRITICAL TRANSFORMATION: What blocks declare vs. what React components receive:
//
// 1. Block declares: `fields: state.fields(['value', 'loading'])`
// 2. `fields()` returns: `{ fieldInfoByField: { value: FieldInfo, loading: FieldInfo }, ... }`
// 3. Render extracts: `fields={ blueprint.fields.fieldInfoByField }` (render.jsx:127)
// 4. Component receives: `props.fields.value` (as FieldInfo object)
//
// So blocks work with simple field names, but the internals have FieldInfo
// objects that contain the mapping to events and scopes. The render system does
// the transformation from the blueprint's fieldInfoByField to fields in component props.
//
// Usage in components: `useReduxInput(props, props.fields.value, fallback)`
// where `props.fields.value` is a FieldInfo with {name, event, scope}.
//
import { Scope, scopes } from '../state/scopes';
import { FieldInfoByField, FieldInfoByEvent, FieldInfo } from '../types';
import { ReduxFieldsReturn } from '../types';

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

/*
 * This should be rarely used, but in some cases, we might see
 * something like:
 *    target="id.field"
 * And we would like to look up that field.
 */
export function fieldByName(fieldname) {
  return _fieldInfoByField[fieldname];
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
  const result: {
    fieldInfoByField: FieldInfoByField;
    fieldInfoByEvent: FieldInfoByEvent;
    extend: (...rest: any[]) => { fieldInfoByField: FieldInfoByField; fieldInfoByEvent: FieldInfoByEvent };
  } = {
    fieldInfoByField,
    fieldInfoByEvent,
    extend: (...rest) => concatFields(result, ...rest),
  };
  return result;
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

  const result: {
    fieldInfoByField: FieldInfoByField;
    fieldInfoByEvent: FieldInfoByEvent;
    extend: (...rest: any[]) => { fieldInfoByField: FieldInfoByField; fieldInfoByEvent: FieldInfoByEvent };
  } = {
    fieldInfoByField,
    fieldInfoByEvent,
    extend: (...rest) => concatFields(result, ...rest),
  };

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


/** @internal Used only for testing */
export const __testables = {
  fieldNameToDefaultEventName,
  reset: () => {
    Object.keys(_fieldInfoByField).forEach(k => delete _fieldInfoByField[k]);
    Object.keys(_fieldInfoByEvent).forEach(k => delete _fieldInfoByEvent[k]);
  }
};
