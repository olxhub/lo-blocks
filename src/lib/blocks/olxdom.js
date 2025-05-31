// Helper functions for traversing the OLX shadow DOM
//
// This is dynamically constructed during the render, and represents
// the currently-rendered OLX nodes (removing duplicates)


/**
 * Traverses up the parent chain, returning all parent nodeInfos
 * that match the selector function. Closest parent first.
 *
 * @param {Object} nodeInfo - The starting nodeInfo
 * @param {Function} selector - Predicate on nodeInfo (default: always true)
 * @returns {Array} Array of matching parent nodeInfos
 */
export function getParents(nodeInfo, { selector = () => true, includeRoot = false} = {}) {
  const results = [];
  let current = includeRoot ? nodeInfo : nodeInfo.parent;

  while (current) {
    if (selector(current)) {
      results.push(current);
    }
    current = current.parent;
  }
  return results;
}

/**
 * Returns all descendant nodeInfos of the given nodeInfo,
 * matching the selector, in BFS order (optionally including root).
 */
export function getChildrenBFS(nodeInfo, { selector = () => true, includeRoot = false } = {}) {
  const results = [];
  const queue = includeRoot
    ? [nodeInfo]
    : Object.values(nodeInfo.renderedChildren || {});

  while (queue.length) {
    const current = queue.shift();
    if (selector(current)) {
      results.push(current);
    }
    queue.push(...Object.values(current.renderedChildren || {}));
  }

  return results;
}

/**
 * Returns all descendant nodeInfos of the given nodeInfo,
 * matching the selector, in DFS preorder (optionally including root).
 */
export function getChildrenDFS(nodeInfo, { selector = () => true, includeRoot = false } = {}) {
  const results = [];
  function visit(ni, isRoot) {
    if ((includeRoot || !isRoot) && selector(ni)) {
      results.push(ni);
    }
    Object.values(ni.renderedChildren || {}).forEach(child =>
      visit(child, false)
    );
  }
  visit(nodeInfo, true);
  return results;
}


/**
 * Convert the various accepted forms of targets into an array of IDs.
 * Accepts: array, comma-string, single string, true/false/null/undefined.
 *   - false/null/undefined => false
 *   - "foo,bar,baz" => ["foo", "bar", "baz"]
 *   - ["foo", "bar"] => ["foo", "bar"]
 *   - "foo" => ["foo"]
 *   - true => Raise an exception
 * @param {any} targets
 * @returns {string[]}
 */
function normalizeTargetIds(targets) {
  if (!targets) return false; // Target was not specified
  if (targets === true) throw new Error('Boolean true is not a valid target');
  if (Array.isArray(targets)) return targets.map(String);
  if (typeof targets === "string") return targets.split(',').map(s => s.trim()).filter(Boolean);
  throw new Error('Unsupported target type');
}

/**
 * Normalize infer to an array of modes: ['parents','children']
 * Accepts: true/false (bool or string, case-insensitive), string (comma or single), array, null/undefined.
 *   - null/undefined => nullDefaults
 *   - false/"false" => []
 *   - true/"true" => allDefaults
 *   - "parents" => ['parents']
 *   - ["parents","children"] => ['parents','children']
 * Validates against allowedItems.
 * @param {any} infer
 * @param {string[]} nullDefaults
 * @param {string[]} allDefaults
 * @param {string[]} allowedItems
 * @returns {string[]}
 */
function normalizeInfer(
  infer,
  nullDefaults,
  allDefaults = ['parents', 'children'],
  allowedItems = ['parents', 'children']
) {
  if (infer == null) return nullDefaults;
  let items;
  if (Array.isArray(infer)) {
    items = infer.map(v => String(v).trim().toLowerCase());
  } else {
    const str = String(infer).trim().toLowerCase();
    if (str === "false") return [];
    if (str === "true") return allDefaults.slice();
    items = str.split(",").map(v => v.trim()).filter(Boolean);
  }
  for (const item of items) {
    if (!allowedItems.includes(item)) {
      throw new Error(`Invalid infer value: ${item}`);
    }
  }
  return items;
}

/**
 * Generic inference utility for finding related nodes by selector.
 *
 * @param {Object} props - Props object (must include 'node' and maybe 'idMap')
 * @param {Object} options
 *   - selector: (nodeInfo) => boolean  (required)
 *   - infer:    true | false | 'parents' | 'children' | ['parents',...] | undefined
 *       - true: both directions; false: none; string/array: directions
 *   - targets:  string | string[] | comma string | undefined
 *       - Accepts array, comma-separated string, or single string.
 *       - true/false/null/undefined are treated as []
 * @returns {Object[]} Array of nodeInfos matching selector/inference/targets, deduped by id
 */
export function inferRelatedNodes(props, {
  selector,
  infer,
  targets,
} = {}) {
  const { node } = props;
  if (!node) throw new Error("inferRelatedNodes: props.node is required");
  if (!selector) throw new Error("inferRelatedNodes: selector is required");

  // See above for logic and docstring
  const targetIds = normalizeTargetIds(targets);
  const inferModes = normalizeInfer(
    infer,
    (targets ? [] : ['parents', 'children']) // default: infer if no targets, else don't
  );

  // Use an object for de-duplication by id
  return [... new Set([
    ...targetIds
      ? targetIds : [],
    ...inferModes.includes('parents')
      ? getParents(node, { selector, includeRoot: false }).map(n=>n.node.id) : [],
    ...inferModes.includes('children')
      ? getChildrenBFS(node, { selector, includeRoot: false }).map(n=>n.node.id) : []
  ])];
}

export const __testables = {
  normalizeTargetIds,
  normalizeInfer
};
