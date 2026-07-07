// packages/shared/lib/state/fields.ts
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
import { stateField, fieldNameToDefaultEventName } from './fieldTypes';
import { assertNotReserved } from '../stateLanguage/keywords';

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
 * Extract FieldInfo values from a Fields object (skipping the extend method).
 *
 * Exported so the block factory's mixin-composition layer can pull the
 * raw FieldInfo list out of one `Fields` object and feed it back into
 * `fields(...)` to produce a merged `Fields` with a working `extend()`.
 * A direct merge isn't possible because `extend` closes over its
 * originating `Fields` object, so the only way to get a merged result
 * with a coherent `extend` is to round-trip through `fields(...)`.
 */
export function fieldInfosFrom(f: Fields): FieldInfo[] {
  return Object.values(f).filter((v): v is FieldInfo =>
    v && typeof v === 'object' && v.type === 'field'
  );
}

/**
 * A field declaration: a string name, a FieldInfo object, or a nested array.
 * Strings become stateFields with default events. Objects with a `name`
 * property get missing defaults filled in. Arrays are flattened recursively.
 */
// Object form: a name plus any FieldInfo options — the runtime passes
// them through wholesale (see normalize), so the type must too, or a new
// axis type-errors here while working everywhere else.
type FieldDecl = string | FieldInfo
  | ({ name: string; event?: string } & Partial<Omit<FieldInfo, 'type' | 'name' | 'events'>> & { events?: string[] })
  | FieldDecl[];

/** Recursively normalize field declarations into a flat list of FieldInfos. */
function normalize(decl: FieldDecl): FieldInfo[] {
  if (Array.isArray(decl)) {
    return decl.flatMap(normalize);
  }
  if (typeof decl === 'string') {
    return [stateField(decl)];
  }
  // Already a fully-baked FieldInfo (e.g., from docField() or commonFields)
  if ('type' in decl && decl.type === 'field' && 'events' in decl && decl.events) {
    return [decl as FieldInfo];
  }
  // Object with name — fill in defaults via stateField. Options pass
  // through WHOLESALE (the previous allow-list here silently dropped any
  // new field axis — the same bug class that once un-URL'd every url:true
  // field). `event` keeps its special expansion into `events`.
  const { name, event, ...rest } = decl as { name: string; event?: FieldEvent } & Record<string, any>;
  return [stateField(name, {
    ...rest,
    ...(event ? { events: [event], event } : {}),
  })];
}

/**
 * Declare fields for a block. Returns an object where field names map to FieldInfo.
 *
 * Accepts a string, a FieldInfo, or arbitrarily nested arrays — all
 * normalized and flattened into a single set of fields.
 *
 * @example
 * state.fields('value')
 * state.fields(['value', 'loading'])
 * state.fields(graderFields())
 * state.fields([graderFields(), 'customHint'])
 * state.fields([docField('value'), { name: 'setting', scope: scopes.componentSetting }])
 */
export function fields(decl: FieldDecl): Fields {
  const infos = normalize(decl);

  // Build the result object: { fieldName: FieldInfo, ... }
  const fieldsByName: Record<string, FieldInfo> = {};
  const fieldsByEvent: FieldInfoByEvent = {};

  for (const info of infos) {
    assertNotReserved(info.name, `[fields]`);
    if (fieldsByName[info.name]) {
      throw new Error(
        `[fields] Duplicate field name "${info.name}". ` +
        `Each field must have a unique name within a block.`
      );
    }
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
    extend: (...more: Fields[]) => fields([fieldInfosFrom(result as Fields), ...more.map(fieldInfosFrom)]),
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
