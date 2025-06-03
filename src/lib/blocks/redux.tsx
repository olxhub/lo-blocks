import * as lo_event from 'lo_event';
import * as idResolver from './idResolver';

import { useComponentSelector } from './selectors.ts';

const _fieldToEventMap = {};
const _eventToFieldMap = {};

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
function checkConflicts(globalMap, newMap, type = "field") {
  for (const [key, value] of Object.entries(newMap)) {
    if (
      globalMap.hasOwnProperty(key) &&
      globalMap[key] !== value
    ) {
      throw new Error(
        `[fields] Conflicting ${type} registration: "${key}" was previously mapped to "${globalMap[key]}", but attempted to map to "${value}".`
      );
    }
  }
}

export function fields(fieldnames) {
  // Handle the array case: {field: null}
  let initialMapping = Array.isArray(fieldnames)
    ? Object.fromEntries(fieldnames.map(f => [f, null]))
    : { ...fieldnames };

  // Convert nulls to default event names
  let fieldToEventMap = {};
  for (const [field, event] of Object.entries(initialMapping)) {
    fieldToEventMap[field] = event ?? fieldNameToDefaultEventName(field);
  }

  // Reverse mapping: eventToFieldMap
  const eventToFieldMap = Object.fromEntries(
    Object.entries(fieldToEventMap).map(([k, v]) => [v, k])
  );

  // fields and events enums
  const fieldsEnum = Object.fromEntries(
    Object.keys(fieldToEventMap).map(f => [f, f])
  );
  const eventsEnum = Object.fromEntries(
    Object.values(fieldToEventMap).map(e => [e, e])
  );

  checkConflicts(_fieldToEventMap, fieldToEventMap, "field");
  checkConflicts(_eventToFieldMap, eventToFieldMap, "event");

  Object.assign(_fieldToEventMap, fieldToEventMap);
  Object.assign(_eventToFieldMap, eventToFieldMap);

  return {
    fields: fieldsEnum,
    events: eventsEnum,
    fieldToEventMap,
    eventToFieldMap,
  };
}

export function assertValidField(field) {
  if (!_fieldToEventMap.hasOwnProperty(field)) {
    throw new Error(`Invalid field: ${field}`);
  }
  return field; // optionally return the field for chaining
}

export function useReduxState(id, field, fallback) {
  id = idResolver.reduxId(id)
  assertValidField(field);
  const value = useComponentSelector(id, state => {
    if (!state) return fallback;
    return state[field] !== undefined ? state[field] : fallback;
  });

  const setValue = (newValue) => {
    const eventType = _fieldToEventMap[field]; // map field to event

    if (!eventType) {
      console.warn(`[useReduxState] No event mapping found for field "${field}"`);
      return;
    }

    lo_event.logEvent(eventType, {
      id,
      [field]: newValue
    });
  };

  return [value, setValue];
}

/** @internal Used only for testing */
export const __testables = {
  fieldNameToDefaultEventName,
  reset: () => {
    Object.keys(_fieldToEventMap).forEach(k => delete _fieldToEventMap[k]);
    Object.keys(_eventToFieldMap).forEach(k => delete _eventToFieldMap[k]);
  }
};
