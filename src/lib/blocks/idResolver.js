// src/lib/blocks/idResolver.js
//
// ID resolution system - handles the complex mapping between different ID types.
//
// IDs are complex (see /docs/). We would like explicit logic for managing IDs.
// This is a first stab at it and is half-baked:
// - We don't know the ID Resolution Matrix is correct
// - We do want to have a central place to do this
// - We may want to add different types of context in the future
//   (e.g. add prefixes, namespaces, etc. to various IDs)
//
// Learning Observer blocks need multiple types of IDs for different purposes:
// - `reduxId`: Key for storing state in Redux (may include prefixes for lists)
// - `nodeId`: Reference in the OLX content tree (for lookups in idMap)
// - `htmlId`: DOM element ID for accessibility and styling
// - `reactKey`: React reconciliation key for list rendering
// - `urlName`: Human-friendly URL component (like edX url_name)
//
// Some of these may be identical, but for example, an OLX node repeated
// twice will have one ID in the static DOM, but need two IDs in anything
// render-time (like React keys)

const ID_RESOLUTION_MATRIX = {
  reduxId:      ["stateId", "id", "urlName", "url_name"],
  nodeId:       "nodeId.sentinel",  // Handled out-of-line; included for introspection in test case
  // And, e.g.:
  urlName:      ["urlName", "url_name", "id"],
  htmlId:       ["id", "urlName", "url_name", "key"],
  reactKey:     ["key", "id", "urlName", "url_name"],
  displayName:  ["displayName", "display_name", "urlName", "url_name", "name", "id"]
};

/**
 * Internal generic resolver: returns string ID or throws.
 */
function resolveIdForContext(context, matrix = ID_RESOLUTION_MATRIX) {
  return (input, defaultValue) => {
    if (typeof input === "string") return input;
    const priorityList = matrix[context];
    if (!priorityList) throw new Error(`Unknown ID context: ${context}`);
    for (const key of priorityList) {
      if (input && typeof input[key] === "string" && input[key].length > 0) {
        return input[key];
      }
    }
    if (defaultValue !== undefined) return defaultValue;
    // Provide a friendly error message when an ID is missing
    if (context === 'reduxId') {
      const name =
        input?.blueprint?.OLXName ||
        input?.nodeInfo?.node?.tag ||
        input?.displayName ||
        input?.name ||
        'Component';
      throw new Error(`${name} requires a well-formed ID`);
    }
    throw new Error(`Could not resolve ID. [Context: '${context}' / Input: ${input}]`);
  };
}

// ID used for maintaining state.
//
// One node in OLX may lead to between zero and many states. For example, in
// lists and templated content, a node like:
//    <TextArea id="supporting_argument/>
// May need to translate to have multiple state for each time it appears:
//    graphic_organizer.1.supporting_argument
//    graphic_organizer.2.supporting_argument
//    graphic_organizer.3.supporting_argument
// All of this still comes from the OLX node supporting_argument
//
// ID references support path-like syntax:
//   - "foo"      → relative, gets idPrefix applied (most common)
//   - "/foo"     → absolute, bypasses idPrefix
//   - "./foo"    → explicit relative (same as "foo")
//   - "../foo"   → parent scope (TODO: not yet implemented)
//
// TODO:
// * Helpers to point targets, graders, LLMs, etc. appropriately.
// * Corresponding OLX formats.
// * Helpers to properly combine prefixes. E.g. lists-of-lists or
//   lists-in-namespaces
const _reduxId = resolveIdForContext("reduxId");
export const reduxId = (input, defaultValue) => {
  const base = _reduxId(input, defaultValue);

  // Absolute references (starting with /) bypass the prefix
  if (base.startsWith('/')) {
    return base.slice(1);
  }

  // Explicit relative (starting with ./) - strip prefix marker
  const resolvedBase = base.startsWith('./') ? base.slice(2) : base;

  const prefix = input?.idPrefix ?? '';
  return prefix ? `${prefix}.${resolvedBase}` : resolvedBase;
};

// If we would like to look ourselves up in idMap.
//
// In the above example, supporting_argument
export const nodeId = (input) => {
  return input.node.id;
};

/**
 * Extract the idMap key from an ID string.
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
 * @param {string} id - The ID which may have prefixes
 * @returns {string} The key to use for idMap lookup
 *
 * @example
 * idMapKey('/foo')                    // => 'foo'
 * idMapKey('./foo')                   // => 'foo'
 * idMapKey('foo')                     // => 'foo'
 * idMapKey('list.0.child')            // => 'child'
 * idMapKey('mastery.attempt_0.q1')    // => 'q1'
 * idMapKey('/list.0.child')           // => 'child'
 */
export const idMapKey = (id) => {
  if (typeof id !== 'string') return id;

  // Strip path prefixes first
  let result = id;
  if (result.startsWith('/')) result = result.slice(1);
  else if (result.startsWith('./')) result = result.slice(2);

  // Extract last segment (the base ID) - namespace prefixes come before it
  const lastDot = result.lastIndexOf('.');
  if (lastDot !== -1) {
    result = result.slice(lastDot + 1);
  }

  return result;
};

// And, e.g.:
export const urlName = resolveIdForContext("urlName");
export const htmlId = resolveIdForContext("htmlId");
export const reactKey = resolveIdForContext("reactKey");
export const displayName = resolveIdForContext("displayName");

/**
 * Extends the ID prefix for child components.
 *
 * Used when a block needs to render children with scoped state (e.g., list items,
 * repeated problem attempts). Returns an object with `idPrefix` to spread into props.
 *
 * @param {object} props - The parent component's props (may contain idPrefix)
 * @param {string} scope - The scope to add (e.g., "item_0", "attempt_1")
 * @returns {{ idPrefix: string }} Object to spread into child props
 *
 * @example
 * // In a list component:
 * renderCompiledKids({ ...props, ...extendIdPrefix(props, `${id}.${index}`) })
 *
 * // In MasteryBank:
 * render({ ...props, node: problemNode, ...extendIdPrefix(props, `${id}.attempt_${n}`) })
 */
export function extendIdPrefix(props, scope) {
  return { idPrefix: props.idPrefix ? `${props.idPrefix}.${scope}` : scope };
}

export const __testables = { ID_RESOLUTION_MATRIX };
