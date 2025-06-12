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
    throw new Error(`Could not resolve ID for context '${context}' from input: ${JSON.stringify(input)}`);
  };
}

// Exported functions
export const reduxId = resolveIdForContext("reduxId");
export const urlName = resolveIdForContext("urlName");
export const htmlId = resolveIdForContext("htmlId");
export const reactKey = resolveIdForContext("reactKey");
export const displayName = resolveIdForContext("displayName");

export const __testables = { ID_RESOLUTION_MATRIX };
