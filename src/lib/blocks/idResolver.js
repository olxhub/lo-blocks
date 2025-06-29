// src/lib/blocks/idResolver.js
/*
 * IDs are complex (see /docs/). We would like explicit logic for
 * managing IDs. This is a first stab at it.
 *
 * - We don't know the ID Resolution Matrix is correct
 * - We do want to have a central place to do this
 * - We may want to add different types of context in the future
 *   (e.g. add prefixes, namespaces, etc. to various IDs)
 */

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
// TODO:
// * Helpers to point targets, graders, LLMs, etc. appropriately.
// * Corresponding OLX formats.
// * Helpers to properly combine prefixes. E.g. lists-of-lists or
//   lists-in-namespaces
const _reduxId = resolveIdForContext("reduxId");
export const reduxId = (input, defaultValue) => {
  const base = _reduxId(input, defaultValue);
  const prefix = input?.idPrefix ?? '';
  return prefix ? `${prefix}.${base}` : base;
};

// If we would like to look ourselves up in idMap.
//
// In the above example, supporting_argument
export const nodeId = (input) => {
  return input.node.id;
};

// And, e.g.:
export const urlName = resolveIdForContext("urlName");
export const htmlId = resolveIdForContext("htmlId");
export const reactKey = resolveIdForContext("reactKey");
export const displayName = resolveIdForContext("displayName");


export const __testables = { ID_RESOLUTION_MATRIX };
