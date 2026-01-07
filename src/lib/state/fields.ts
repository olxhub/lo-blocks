// src/lib/state/fields.ts
//
// Field definition system - declarative state management for Learning Observer blocks.
//
// The `fields()` function declares what state a block uses. It returns an object
// where each field name maps to a FieldInfo object:
//
//   export const fields = state.fields(['value', 'loading']);
//   // Returns: { value: FieldInfo, loading: FieldInfo, extend: fn }
//
// This same shape flows through the system:
//   - Block definition: fields.value works
//   - Component props: props.fields.value works
//   - Both are FieldInfo objects with {name, event, scope}
//
// Usage in components: `useReduxInput(props, props.fields.value, fallback)`
//
// Internally, fields are also registered globally for:
//   - `fieldByName()` lookups (for dynamic OLX references like target="foo.value")
//   - Collision detection (same field name can't have different events)
//
import { Scope, scopes } from '../state/scopes';
import { Fields, FieldInfoByEvent, FieldInfo } from '../types';
import { commonFields } from './commonFields';

const _fieldInfoByField: Record<string, FieldInfo> = {};
const _fieldInfoByEvent: FieldInfoByEvent = {};

// =============================================================================
// Common fields - pre-registered for cross-component access
// =============================================================================
// These fields are registered globally at module load time, so they're available
// even before specific blocks are loaded. This enables cross-component field
// access (e.g., MasteryBank checking a grader's 'correct' field).
//
// The definitions live in commonFields.ts for type-safe access.
// =============================================================================

// Register common fields immediately
for (const field of Object.values(commonFields)) {
  _fieldInfoByField[field.name] = field;
  _fieldInfoByEvent[field.event] = field;
}

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
function checkConflicts(globalMap: Record<string, FieldInfo>, newMap: Record<string, FieldInfo>, type = "field") {
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

/**
 * Concatenate multiple field definitions into one.
 * Used by extend() and for combining field sets.
 */
export function concatFields(...lists: Fields[]): Fields {
  const merged: Record<string, FieldInfo> = {};
  for (const list of lists) {
    // Copy all FieldInfo entries (skip the extend method)
    for (const [key, value] of Object.entries(list)) {
      if (key !== 'extend' && value && typeof value === 'object' && value.type === 'field') {
        merged[key] = value;
      }
    }
  }
  const result = {
    ...merged,
    extend: (...more: Fields[]) => concatFields(result as Fields, ...more),
  } as Fields;
  return result;
}

type FieldSpec = string | FieldInfo | { name: string; event?: string; scope?: Scope };

/**
 * Declare fields for a block. Returns an object where field names map to FieldInfo.
 *
 * @example
 * // Simple field names (default event and scope)
 * export const fields = state.fields(['value', 'loading']);
 * // fields.value is FieldInfo { name: 'value', event: 'UPDATE_VALUE', scope: 'component' }
 *
 * @example
 * // Using common fields (preferred for value, correct, etc.)
 * export const fields = state.fields([commonFields.value]);
 * // Reuses the pre-registered field definition
 *
 * @example
 * // Custom event or scope
 * export const fields = state.fields([
 *   'value',
 *   { name: 'history', event: 'HISTORY_CHANGED' },
 *   { name: 'setting', scope: scopes.componentSetting }
 * ]);
 */
export function fields(fieldList: FieldSpec[]): Fields {
  const infos: FieldInfo[] = fieldList.map(item => {
    if (typeof item === 'string') {
      return { type: 'field', name: item, event: fieldNameToDefaultEventName(item), scope: scopes.component };
    }
    // Object with name - fill in any missing defaults
    const name = item.name;
    const event = item.event ?? fieldNameToDefaultEventName(name);
    const scope = item.scope ?? scopes.component;
    return { type: 'field', name, event, scope };
  });

  // Build the result object: { fieldName: FieldInfo, ... }
  const fieldsByName: Record<string, FieldInfo> = {};
  const fieldsByEvent: FieldInfoByEvent = {};

  for (const info of infos) {
    fieldsByName[info.name] = info;
    fieldsByEvent[info.event] = info;
  }

  // Check for conflicts with globally registered fields
  checkConflicts(_fieldInfoByField, fieldsByName, "field");
  checkConflicts(_fieldInfoByEvent, fieldsByEvent, "event");

  // Register globally for fieldByName() and collision detection
  Object.assign(_fieldInfoByField, fieldsByName);
  Object.assign(_fieldInfoByEvent, fieldsByEvent);

  const result = {
    ...fieldsByName,
    extend: (...more: Fields[]) => concatFields(result as Fields, ...more),
  } as Fields;

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
