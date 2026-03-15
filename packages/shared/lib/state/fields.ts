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
//   - Both are FieldInfo objects with {name, events, scope}
//
// Usage in components: `useField(props, props.fields.value)`
//
// Fields belong to blocks — two blocks can have a "value" field with different
// storage types (plain string vs RgaDoc). The global registry is for convenience
// lookups only (fieldByName), not for enforcement.
//
import { Scope, scopes } from '../state/scopes';
import { Fields, FieldInfoByEvent, FieldInfo, FieldName, FieldEvent } from '../types';
import { commonFields } from './commonFields';
import { plainField, fieldNameToDefaultEventName } from './fieldTypes';

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
  for (const ev of field.events) {
    _fieldInfoByEvent[ev] = field;
  }
}

/*
 * This should be rarely used, but in some cases, we might see
 * something like:
 *    target="id.field"
 * And we would like to look up that field.
 *
 * TODO: Migrate to looking up the field from the block's registry entry
 * instead of this global map. With block-scoped fields, the same field name
 * can have different types across blocks.
 */
export function fieldByName(fieldname: string) {
  return _fieldInfoByField[fieldname];
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

/** What block authors write: a string, an object with optional defaults, or a fully-baked FieldInfo.
 *  The fields() function normalizes these into FieldInfo with all defaults filled in. */
type FieldSpec = string | FieldInfo | { name: string; event?: string; events?: string[]; scope?: Scope; schema?: FieldInfo['schema']; read?: FieldInfo['read']; equality?: FieldInfo['equality'] };

/**
 * Declare fields for a block. Returns an object where field names map to FieldInfo.
 *
 * @example
 * // Simple field names (default event and scope)
 * export const fields = state.fields(['value', 'loading']);
 * // fields.value is FieldInfo { name: 'value', events: ['UPDATE_VALUE'], scope: 'component' }
 *
 * @example
 * // Using field type constructors
 * import { docField } from '@/lib/state/fieldTypes';
 * export const fields = state.fields([docField('value')]);
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
    // Already a fully-baked FieldInfo (e.g., from docField() or commonFields)
    if (typeof item === 'object' && 'type' in item && item.type === 'field' && 'events' in item && item.events) {
      return item as FieldInfo;
    }
    if (typeof item === 'string') {
      return plainField(item);
    }
    // Object with name - build on top of plainField defaults
    const base = plainField(item.name, {
      ...('events' in item && item.events ? { events: item.events as FieldEvent[] } : {}),
      ...('event' in item && item.event ? { events: [item.event as FieldEvent], event: item.event } : {}),
      ...('scope' in item && item.scope ? { scope: item.scope } : {}),
      ...('schema' in item && item.schema ? { schema: item.schema } : {}),
      ...('read' in item && item.read ? { read: item.read } : {}),
      ...('equality' in item && item.equality ? { equality: item.equality } : {}),
    });
    return base;
  });

  // Build the result object: { fieldName: FieldInfo, ... }
  const fieldsByName: Record<string, FieldInfo> = {};
  const fieldsByEvent: FieldInfoByEvent = {};

  for (const info of infos) {
    fieldsByName[info.name] = info;
    for (const ev of info.events) {
      fieldsByEvent[ev] = info;
    }
  }

  // Register globally for fieldByName() lookups (last-writer-wins).
  // No collision detection — fields belong to blocks, not to a global registry.
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
