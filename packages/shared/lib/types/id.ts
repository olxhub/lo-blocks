// packages/shared/lib/types/id.ts
import type { OlxReference, OlxKey, ReduxStateKey, IdPrefix, ScopeMarker, OLXTag, FieldName, FieldEvent } from './core';
//
// ID Resolution System
// ====================
//
// Single source of truth for converting between different ID types.
// See docs/architecture/id-*.md for detailed design documentation.
//
// TWO DIFFERENT SEPARATORS
// ------------------------
// (a) OLX paths: "/" for namespaces like "/edu.mit/pmitros/6.002x/hw1"
// (b) Redux scopes: ":" for instance scoping like "thesistopics:1:topic"
//
// These serve different roles:
// - OLX paths identify content definitions (directory-style hierarchy)
// - Redux scopes identify runtime instances (e.g., DynamicList items)
//
// WHY MULTIPLE ID TYPES?
// ----------------------
// OLX is a DAG (directed acyclic graph). The same element can appear multiple
// times on a page - either reused with the same logical ID, or instantiated
// with different IDs (e.g., in a DynamicList).
//
// HTML and React are trees. IDs and keys MUST be unique per position.
//
// This creates tension:
//   - Same element reused twice → MUST share Redux state (same reduxKey)
//   - Same element in two list items → MUST have separate state (different reduxKey)
//   - Both cases → MUST have unique React keys (different reactKey)
//
// ID TYPES AND THEIR RELATIONSHIPS
// --------------------------------
//
//   ref (OLX input)     What's written in OLX: "/foo", "./foo", "foo"
//         ↓
//   olxKey              Resolved key for idMap lookup: "foo"
//         ↓             (strips /, ./, namespaces)
//   reduxKey            State storage key: "list:0:foo"
//                       (adds idPrefix for scoped instances, using ":")
//
//   For rendering:
//   kids[]  → assignReactKeys() → reactKey per child (unique among siblings)
//
// | ID Type    | Purpose                    | Uniqueness           | Example              |
// |------------|----------------------------|----------------------|----------------------|
// | ref        | ID as written in OLX       | n/a (input form)     | "/foo", "./foo"      |
// | olxKey     | Definition lookup          | Per definition       | "foo"                |
// | reduxKey   | State storage              | Per logical instance | "list:0:foo"         |
// | reactKey   | React reconciliation       | Per sibling position | "foo", "foo:1"       |
// | htmlId     | DOM element ID             | Per rendered element | "foo"                |
//
// REFERENCE FORMS
// ---------------
// IDs in OLX can be written in different forms:
//   "/foo"     - Absolute: bypasses idPrefix, always resolves to "foo"
//   "./foo"    - Explicit relative: applies idPrefix
//   "foo"      - Bare: applies idPrefix (most common)
//   "../foo"   - Parent scope (TODO: not yet implemented)
//
// OPERATIONS
// ----------
// Resolution:
//   refToReduxKey(props)        - "prefix.id" for state storage
//   refToOlxKey(id)             - strips prefix, gets base ID for idMap lookup
//   htmlId(props)               - DOM-safe ID
//
// Scoping:
//   extendIdPrefix(props, scope)  - { idPrefix: "parent:scope" }
//
// Arrays:
//   assignReactKeys(children)     - unique keys for siblings (TODO: move from render.jsx)
//
// ID CONSTRAINTS
// --------------
// User-authored IDs must match: [a-zA-Z_][a-zA-Z0-9_]*
//   - Start with a letter or underscore
//   - Contain only letters, digits, and underscores
//   - Python/JS identifier-friendly
//
// Auto-generated IDs: "_" + SHA1 hex hash (avoids leading-digit violation)
//
// RESERVED DELIMITER CHARACTERS (never in user IDs)
// -------------------------------------------------
// | Char | Purpose                                          |
// |------|--------------------------------------------------|
// | :    | Redux scope separator (list:#0:child)             |
// | #    | ScopeMarker prefix (#0, #attempt_2)               |
// | /    | OLX reference path prefix (/absolute, ./relative) |
// | .    | Reserved for future namespace hierarchy            |
// | -    | Reserved for future use                            |
// | ,    | Target list separator (target="input1,input2")     |
//

// =============================================================================
// SEPARATORS
// =============================================================================
// Redux scope separator - used to build scoped instance keys like "list:0:item"
// This is distinct from "/" used in OLX paths for content namespaces.
export const REDUX_SCOPE_SEPARATOR = ':';

// ScopeMarker prefix — segments starting with '#' are instance markers, not block IDs.
export const SCOPE_MARKER_PREFIX = '#';

/**
 * Create a ScopeMarker for use in extendIdPrefix.
 *
 * ScopeMarkers are non-OlxKey segments in ReduxStateKeys that represent
 * instance indices, attempt numbers, etc. They start with '#' so they
 * can be distinguished from OlxKeys during decomposition.
 *
 * @param label - Instance identifier (number or string). Must match [0-9a-zA-Z_]+
 * @returns Branded ScopeMarker string (e.g., '#0', '#attempt_2')
 * @throws Error if label contains invalid characters
 *
 * @example
 *   scopeMarker(0)            // → '#0'
 *   scopeMarker('attempt_2')  // → '#attempt_2'
 */
const VALID_SCOPE_LABEL = /^[0-9a-zA-Z_]+$/;

export function scopeMarker(label: string | number): ScopeMarker {
  const str = String(label);
  if (!VALID_SCOPE_LABEL.test(str)) {
    throw new Error(
      `scopeMarker: label "${label}" is invalid — must match [0-9a-zA-Z_]+`
    );
  }
  return `${SCOPE_MARKER_PREFIX}${str}` as ScopeMarker;
}

/**
 * Extract the target (leaf) OlxKey from a ReduxStateKey.
 *
 * Returns the last non-ScopeMarker segment — the specific block this key
 * points to. This is the correct way to get the content key for a scoped
 * ReduxStateKey; it handles ScopeMarkers properly unlike refToOlxKey which
 * blindly takes the last ':'-delimited segment.
 *
 * @example
 *   reduxKeyToOlxKey('myList:#0:answer')       // → 'answer'
 *   reduxKeyToOlxKey('answer')                  // → 'answer'
 *   reduxKeyToOlxKey('bank:#attempt_2:child')   // → 'child'
 */
export function reduxKeyToOlxKey(key: ReduxStateKey): OlxKey {
  const segments = key.split(REDUX_SCOPE_SEPARATOR);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i].startsWith(SCOPE_MARKER_PREFIX)) {
      return segments[i] as OlxKey;
    }
  }
  // Shouldn't happen — a ReduxStateKey must contain at least one OlxKey.
  // Fall back to last segment to avoid throwing in production.
  return segments[segments.length - 1] as OlxKey;
}

/**
 * Extract ALL OlxKeys from a ReduxStateKey.
 *
 * Returns every non-ScopeMarker segment — all the loadable block IDs
 * in the scope chain. Used for content loading: when a target= attribute
 * references a scoped key, we need to ensure all blocks in the chain
 * are fetched.
 *
 * @example
 *   allOlxKeys('myList:#0:answer')       // → ['myList', 'answer']
 *   allOlxKeys('answer')                  // → ['answer']
 *   allOlxKeys('bank:#attempt_2:child')   // → ['bank', 'child']
 *   allOlxKeys('a:#0:b:#1:c')             // → ['a', 'b', 'c']
 */
export function allOlxKeys(key: ReduxStateKey): OlxKey[] {
  return key
    .split(REDUX_SCOPE_SEPARATOR)
    .filter(seg => !seg.startsWith(SCOPE_MARKER_PREFIX)) as OlxKey[];
}

// Valid ID segment: must start with letter or underscore, then letters/digits/underscores.
// No hyphens, dots, colons, slashes, or commas — those are reserved as delimiters.
// Path prefixes (/, ./, ../) are stripped before validation.
export const VALID_ID_SEGMENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const INVALID_CHARS_DISPLAY = /[^a-zA-Z0-9_\s]/g;  // For error messages

// Valid ReduxStateKey: one or more segments separated by ":", where each segment
// is either an OlxKey ([a-zA-Z_][a-zA-Z0-9_]*) or a ScopeMarker (#[0-9a-zA-Z_]+).
// Examples: "foo", "myList:#0:answer", "a:#0:b:#1:c"
const OLXKEY_SEG = '[a-zA-Z_][a-zA-Z0-9_]*';
const SCOPE_SEG = '#[0-9a-zA-Z_]+';
export const VALID_REDUX_STATE_KEY = new RegExp(
  `^(${OLXKEY_SEG}|${SCOPE_SEG})(:${OLXKEY_SEG}|:${SCOPE_SEG})*$`
);

/**
 * Validate and brand a string as a ReduxStateKey.
 *
 * A ReduxStateKey is one or more colon-separated segments, each being either
 * an OlxKey (block ID) or a ScopeMarker (#index). Must contain at least one
 * OlxKey segment.
 *
 * Use this at system boundaries where target= values enter the type system.
 *
 * @param input - Raw string from OLX target= attribute
 * @param context - Description for error messages
 * @returns Branded ReduxStateKey
 * @throws Error with human-friendly message if invalid
 *
 * @example
 *   toReduxStateKey('foo')                  // → 'foo'
 *   toReduxStateKey('myList:#0:answer')     // → 'myList:#0:answer'
 *   toReduxStateKey('#0')                   // throws — no OlxKey segment
 *   toReduxStateKey('foo-bar')              // throws — invalid characters
 */
export function toReduxStateKey(input: string, context = 'target'): ReduxStateKey {
  if (!input || typeof input !== 'string') {
    throw new Error(`${context}: target is required but got "${input}"`);
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`${context}: target cannot be empty or whitespace`);
  }

  if (!VALID_REDUX_STATE_KEY.test(trimmed)) {
    const invalidChars = trimmed.match(INVALID_CHARS_DISPLAY);
    const charList = invalidChars ? [...new Set(invalidChars)].join(' ') : 'special characters';
    throw new Error(
      `${context}: "${input}" is not a valid target key (invalid characters: ${charList}). ` +
      `Target keys use ":" to separate segments. Each segment must be a block ID ` +
      `(letters/digits/underscores) or a scope marker (#index).`
    );
  }

  // Must contain at least one OlxKey (non-ScopeMarker) segment
  const segments = trimmed.split(REDUX_SCOPE_SEPARATOR);
  const hasOlxKey = segments.some(seg => !seg.startsWith(SCOPE_MARKER_PREFIX));
  if (!hasOlxKey) {
    throw new Error(
      `${context}: "${input}" contains only scope markers — must include at least one block ID.`
    );
  }

  return trimmed as ReduxStateKey;
}

/**
 * Validate and brand a user-provided ID string as OlxReference.
 * Use this at system boundaries where user input enters the type system.
 *
 * @param input - Raw string from OLX id= attribute or target= attribute
 * @param context - Description for error messages (e.g., "id attribute", "target")
 * @returns Branded OlxReference
 * @throws Error with human-friendly message if invalid
 */
export function toOlxReference(input: string, context = 'ID'): OlxReference {
  if (!input || typeof input !== 'string') {
    throw new Error(`${context}: ID is required but got "${input}"`);
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`${context}: ID cannot be empty or whitespace`);
  }

  // Strip path prefix for validation (/, ./, ../)
  const pathPrefix = trimmed.match(/^(\.\.?\/|\/)/)?.[0] || '';
  const idPart = trimmed.slice(pathPrefix.length);

  if (!idPart) {
    throw new Error(`${context}: ID "${input}" has path prefix but no ID`);
  }

  // Check for invalid characters
  if (!VALID_ID_SEGMENT.test(idPart)) {
    const invalidChars = idPart.match(INVALID_CHARS_DISPLAY);
    const charList = invalidChars ? [...new Set(invalidChars)].join(' ') : 'special characters';
    throw new Error(
      `${context}: ID "${input}" contains invalid characters: ${charList}\n` +
      `IDs must start with a letter or underscore and contain only letters, digits, and underscores.`
    );
  }

  return trimmed as OlxReference;
}

/**
 * Convert an OLX reference to a Redux state key.
 *
 * One node in OLX may lead to between zero and many states. For example, in
 * lists and templated content, a node like:
 *    <TextArea id="supporting_argument/>
 * May need to translate to have multiple state for each time it appears:
 *    graphic_organizer.1.supporting_argument
 *    graphic_organizer.2.supporting_argument
 *    graphic_organizer.3.supporting_argument
 * All of this still comes from the OLX node supporting_argument
 *
 * ID references support path-like syntax:
 *   - "foo"      → relative, gets idPrefix applied (most common)
 *   - "/foo"     → absolute, bypasses idPrefix
 *   - "./foo"    → explicit relative (same as "foo")
 *   - "../foo"   → parent scope (TODO: not yet implemented)
 *
 * @param input - OLX reference string, or props object with id and optional idPrefix
 * @returns ReduxStateKey for state access
 *
 * @example
 * refToReduxKey({ id: 'foo', idPrefix: 'list:0' })  // => 'list:0:foo'
 * refToReduxKey({ id: '/foo', idPrefix: 'list:0' }) // => 'foo' (absolute)
 * refToReduxKey({ id: './foo', idPrefix: 'scope' }) // => 'scope:foo'
 * refToReduxKey({ id: 'foo' })                      // => 'foo'
 */
type RefToReduxKeyInput = OlxReference | {
  id?: OlxReference;
  idPrefix?: IdPrefix;
  [key: string]: unknown;
};

export const refToReduxKey = (input: RefToReduxKeyInput): ReduxStateKey => {
  // Extract base ID from string or props.id
  let base: string;
  if (typeof input === 'string') {
    base = input;
  } else if (input && typeof input.id === 'string' && input.id.length > 0) {
    base = input.id;
  } else {
    // Provide a friendly error message when an ID is missing
    const name =
      (input as any)?.loBlock?.name ||
      (input as any)?.nodeInfo?.olxJson?.tag ||
      (input as any)?.name ||
      'Component';
    throw new Error(`${name} requires a well-formed ID`);
  }

  // Absolute references (starting with /) bypass the prefix
  if (base.startsWith('/')) {
    return base.slice(1) as ReduxStateKey;
  }

  // Explicit relative (starting with ./) - strip prefix marker
  const resolvedBase = base.startsWith('./') ? base.slice(2) : base;

  const prefix = (input as { idPrefix?: string })?.idPrefix ?? '';
  return (prefix ? `${prefix}${REDUX_SCOPE_SEPARATOR}${resolvedBase}` : resolvedBase) as ReduxStateKey;
};

/**
 * Convert an OLX reference to an OlxKey for idMap lookup.
 *
 * Strips path prefixes (/, ./) and returns the bare ID.
 * Validates that the result is a valid OlxKey — throws on reserved
 * characters like ":" (ReduxStateKey) or "#" (ScopeMarker).
 *
 * For ReduxStateKeys, use reduxKeyToOlxKey() instead.
 *
 * @param ref - OLX reference string (e.g., "foo", "/foo", "./foo")
 * @returns OlxKey for idMap lookup
 * @throws Error if ref contains reserved delimiters (likely a type boundary violation)
 *
 * @example
 * refToOlxKey('/foo')    // => 'foo'
 * refToOlxKey('./foo')   // => 'foo'
 * refToOlxKey('foo')     // => 'foo'
 */
export const refToOlxKey = (ref: OlxReference): OlxKey => {
  if (typeof ref !== 'string') return ref as unknown as OlxKey;

  // Strip path prefixes (/, ./)
  let result: string = ref;
  if (result.startsWith('/')) result = result.slice(1);
  else if (result.startsWith('./')) result = result.slice(2);

  // Validate: result must be a valid ID segment (no reserved delimiters)
  if (!VALID_ID_SEGMENT.test(result)) {
    const hint = (result.includes(':') || result.includes('#'))
      ? ` This looks like a ReduxStateKey — use reduxKeyToOlxKey() instead.`
      : '';
    throw new Error(
      `refToOlxKey: "${ref}" is not a valid OlxReference.${hint}`
    );
  }

  return result as OlxKey;
};

/**
 * Validate and brand a string as OlxKey.
 *
 * Use at system boundaries where IDs enter as already-resolved keys
 * (no path prefixes like / or ./). For raw OLX references that may
 * have prefixes, use toOlxReference() + refToOlxKey().
 *
 * Validation can be extended later to check if the key exists in idMap.
 */
export function toOlxKey(input: string): OlxKey {
  if (!input || typeof input !== 'string') {
    throw new Error(`toOlxKey: expected non-empty string but got "${input}"`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`toOlxKey: ID cannot be empty or whitespace`);
  }
  if (!VALID_ID_SEGMENT.test(trimmed)) {
    throw new Error(
      `toOlxKey: "${input}" is not a valid OlxKey (must start with letter or underscore, then letters/digits/underscores)`
    );
  }
  return trimmed as OlxKey;
}

/**
 * Extends the ID prefix for child components.
 *
 * Used when a block needs to render children with scoped state (e.g., list items,
 * repeated problem attempts). Returns an object with `idPrefix` to spread into props.
 *
 * @param {object} props - The parent component's props (may contain idPrefix)
 * @param {string | (string | number)[]} scope - The scope to add. Can be a string
 *        or array of parts that will be joined with the separator.
 * @returns {{ idPrefix: string }} Object to spread into child props
 *
 * @example
 * // In a list component — scopeMarker() marks non-OlxKey segments:
 * extendIdPrefix(props, [id, scopeMarker(index)])
 *
 * // In MasteryBank:
 * extendIdPrefix(props, [id, scopeMarker('attempt_' + n)])
 *
 * // Simple string form still works:
 * extendIdPrefix(props, 'child')
 */
export function extendIdPrefix(
  props: { idPrefix?: IdPrefix; [key: string]: unknown },
  scope: string | (string | number | ScopeMarker)[]
): { idPrefix: IdPrefix } {
  const scopeStr = Array.isArray(scope)
    ? scope.join(REDUX_SCOPE_SEPARATOR)
    : scope;
  const newPrefix = props.idPrefix
    ? `${props.idPrefix}${REDUX_SCOPE_SEPARATOR}${scopeStr}`
    : scopeStr;
  return { idPrefix: newPrefix as IdPrefix };
}

/**
 * Assigns unique React keys to an array of children.
 *
 * React requires unique keys for siblings to efficiently reconcile changes.
 * In OLX, the same block can appear multiple times (DAG reuse), so we need
 * to handle duplicate IDs by appending suffixes: "foo", "foo.1", "foo.2".
 *
 * @param {Array} children - Array of child objects, each optionally with an 'id'
 * @returns {Array} New array with unique 'key' property assigned to each child
 * @throws {Error} If a child already has a 'key' property (double-keying bug)
 *
 * @example
 * // Input:  [{ id: "foo" }, { id: "bar" }, { id: "foo" }]
 * // Output: [{ id: "foo", key: "foo" }, { id: "bar", key: "bar" }, { id: "foo", key: "foo:1" }]
 */
export function assignReactKeys(children) {
  const idCounts = {};
  return children.map((child, i) => {
    if (child == null || typeof child !== 'object') {
      // Pass through primitives and non-objects unchanged
      return child;
    }
    if ('key' in child) {
      throw new Error(
        `assignReactKeys: Child at index ${i} already has a 'key' property. ` +
        `Don't double-key children.`
      );
    }
    let key;
    if ('id' in child && child.id != null) {
      if (!idCounts[child.id]) {
        idCounts[child.id] = 1;
        key = child.id;
      } else {
        key = `${child.id}${REDUX_SCOPE_SEPARATOR}${idCounts[child.id]}`;
        idCounts[child.id]++;
      }
    } else {
      key = `__idx__${i}`;
    }
    return { ...child, key };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAG AND FIELD CONVERTERS
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_OLX_TAG = /^[A-Z][a-zA-Z0-9]*$/;

/** Validate and brand an OLX tag name (PascalCase, e.g. "Vertical", "TextBlock"). */
export function toOLXTag(s: string): OLXTag {
  if (!s) throw new Error('OLXTag cannot be empty');
  if (!VALID_OLX_TAG.test(s)) {
    throw new Error(`OLXTag must be PascalCase (start uppercase, then letters/digits): "${s}"`);
  }
  return s as OLXTag;
}

const VALID_FIELD_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Validate and brand a field name. */
export function toFieldName(s: string): FieldName {
  if (!VALID_FIELD_NAME.test(s)) {
    throw new Error(`FieldName must be a valid identifier: "${s}"`);
  }
  return s as FieldName;
}

/** Validate and brand a field event string. */
export function toFieldEvent(s: string): FieldEvent {
  if (!s) throw new Error('FieldEvent cannot be empty');
  return s as FieldEvent;
}

export const __testables = { assignReactKeys };
