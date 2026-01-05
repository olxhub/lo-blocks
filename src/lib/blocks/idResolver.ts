// src/lib/blocks/idResolver.ts
import type { OlxReference, OlxKey, ReduxStateKey } from '../types';
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
// OLX IDs should NOT contain: ".", "/", ":", or whitespace
// These characters are reserved as namespace/path delimiters.
//

// =============================================================================
// SEPARATORS
// =============================================================================
// Redux scope separator - used to build scoped instance keys like "list:0:item"
// This is distinct from "/" used in OLX paths for content namespaces.
export const REDUX_SCOPE_SEPARATOR = ':';

// Valid ID pattern: alphanumeric, underscores, hyphens
// Path prefixes (/, ./, ../) are allowed for references
const VALID_ID_SEGMENT = /^[a-zA-Z0-9_-]+$/;
const INVALID_CHARS_DISPLAY = /[^\w\s/-]/g;  // For error messages

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
      `IDs should only contain letters, numbers, underscores, and hyphens.`
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
type RefToReduxKeyInput = OlxReference | string | {
  id?: OlxReference | string;
  idPrefix?: string;
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
      (input as any)?.loBlock?.OLXName ||
      (input as any)?.nodeInfo?.node?.tag ||
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
 * The idMap uses plain IDs (the base ID without namespace prefixes).
 * This function:
 * - Strips "/" prefix for absolute references
 * - Strips "./" prefix for explicit relative
 * - Extracts the last dot-separated segment (the base ID)
 *
 * Note: OLX IDs should not contain ".", "/", ":", or whitespace.
 * These are reserved as namespace/path delimiters.
 *
 * @param {string} ref - OLX reference which may have prefixes
 * @returns {string} OlxKey for idMap lookup
 *
 * @example
 * refToOlxKey('/foo')                    // => 'foo'
 * refToOlxKey('./foo')                   // => 'foo'
 * refToOlxKey('foo')                     // => 'foo'
 * refToOlxKey('list:0:child')            // => 'child'
 * refToOlxKey('mastery:attempt_0:q1')    // => 'q1'
 * refToOlxKey('/list:0:child')           // => 'child'
 */
export const refToOlxKey = (ref: OlxReference | string): OlxKey => {
  if (typeof ref !== 'string') return ref as unknown as OlxKey;

  // Strip path prefixes first
  let result = ref;
  if (result.startsWith('/')) result = result.slice(1);
  else if (result.startsWith('./')) result = result.slice(2);

  // Extract last segment (the base ID) - scope prefixes come before it
  // Use ":" as the Redux scope separator
  const lastSeparator = result.lastIndexOf(REDUX_SCOPE_SEPARATOR);
  if (lastSeparator !== -1) {
    result = result.slice(lastSeparator + 1);
  }

  return result as OlxKey;
};

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
 * // In a list component (array form keeps separator logic centralized):
 * renderCompiledKids({ ...props, ...extendIdPrefix(props, [id, index]) })
 *
 * // In MasteryBank:
 * render({ ...props, node: problemNode, ...extendIdPrefix(props, [id, 'attempt', n]) })
 *
 * // Simple string form still works:
 * extendIdPrefix(props, 'child')
 */
export function extendIdPrefix(
  props: { idPrefix?: string; [key: string]: unknown },
  scope: string | (string | number)[]
): { idPrefix: string } {
  const scopeStr = Array.isArray(scope)
    ? scope.join(REDUX_SCOPE_SEPARATOR)
    : scope;
  return { idPrefix: props.idPrefix ? `${props.idPrefix}${REDUX_SCOPE_SEPARATOR}${scopeStr}` : scopeStr };
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

export const __testables = { assignReactKeys };
