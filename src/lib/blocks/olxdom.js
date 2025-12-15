// src/lib/blocks/olxdom.js
//
// OLX DOM traversal - navigation utilities for the Learning Observer
// dynamic content DAG.
//
// The OLX DOM is Learning Observer's internal representation of educational content,
// distinct from both the React virtual DOM and the browser DOM. It represents the
// semantic structure of learning activities as a directed acyclic graph (DAG).
//
// Key concepts:
// - `nodeInfo`: Represents a rendered block with parent/child relationships
// - `renderedKids`: Active child nodes (may be subset of static kids)
// - DAG structure: Content can be reused/referenced multiple times
// - Inference: Automatically finding related blocks for actions/grading
//
// This provides the traversal primitives that power the action system's ability
// to automatically find inputs for graders, targets for LLM calls, etc.
//
// This should not be confused with the static OLX DAG.

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
export function getKidsBFS(nodeInfo, { selector = () => true, includeRoot = false } = {}) {
  const results = [];
  const queue = includeRoot
    ? [nodeInfo]
    : Object.values(nodeInfo.renderedKids ?? {});

  while (queue.length) {
    const current = queue.shift();
    if (selector(current)) {
      results.push(current);
    }
    queue.push(...Object.values(current.renderedKids ?? {}));
  }

  return results;
}

/**
 * Returns all descendant nodeInfos of the given nodeInfo,
 * matching the selector, in DFS preorder (optionally including root).
 */
export function getKidsDFS(nodeInfo, { selector = () => true, includeRoot = false } = {}) {
  const results = [];
  function visit(ni, isRoot) {
    if ((includeRoot || !isRoot) && selector(ni)) {
      results.push(ni);
    }
    Object.values(ni.renderedKids ?? {}).forEach(child =>
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
 * Normalize infer to an array of modes: ['parents','kids']
 * Accepts: true/false (bool or string, case-insensitive), string (comma or single), array, null/undefined.
 *   - null/undefined => nullDefaults
 *   - false/"false" => []
 *   - true/"true" => allDefaults
 *   - "parents" => ['parents']
 *   - ["parents","kids"] => ['parents','kids']
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
  allDefaults = ['parents', 'kids'],
  allowedItems = ['parents', 'kids']
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


function root(nodeInfo) {
  while (nodeInfo.parent) nodeInfo = nodeInfo.parent;
  return nodeInfo;
}

/**
 * Safely extract node ID from a nodeInfo, with helpful error for debugging.
 * @param {Object} nodeInfo - The nodeInfo to get ID from
 * @param {string} context - Description of what operation is being performed
 * @returns {string} The node ID
 * @throws {Error} If nodeInfo.node or nodeInfo.node.id is missing
 */
function getNodeId(nodeInfo, context = 'getNodeId') {
  if (!nodeInfo.node) {
    // Root node has sentinel instead of node
    if (nodeInfo.sentinel === 'root') {
      throw new Error(
        `${context}: Attempted to get ID from root sentinel node. ` +
        `This usually means a selector matched the root, which shouldn't have blueprint/node properties. ` +
        `Check that your selector uses n.blueprint (not n.node.blueprint) and handles undefined cases.`
      );
    }
    throw new Error(
      `${context}: nodeInfo.node is undefined. nodeInfo keys: [${Object.keys(nodeInfo).join(', ')}]`
    );
  }
  if (nodeInfo.node.id === undefined) {
    throw new Error(
      `${context}: nodeInfo.node.id is undefined. node keys: [${Object.keys(nodeInfo.node).join(', ')}], ` +
      `tag: ${nodeInfo.node.tag || 'N/A'}`
    );
  }
  return nodeInfo.node.id;
}

export function getAllNodes(nodeInfo, { selector = () => true } = {}) {
  return getKidsDFS(root(nodeInfo), { selector, includeRoot: true });
}

/**
 * Generic inference utility for finding related nodes by selector.
 *
 * @param {Object} props - Props object (must include 'node' and maybe 'idMap')
 * @param {Object} options
 *   - selector: (nodeInfo) => boolean  (required)
 *   - infer:    true | false | 'parents' | 'kids' | ['parents',...] | undefined
 *       - true: both directions; false: none; string/array: directions
 *   - targets:  string | string[] | comma string | undefined
 *       - Accepts array, comma-separated string, or single string.
 *       - true/false/null/undefined are treated as []
 *   - closest:  boolean (default false)
 *       - If true, return only the nearest match in each direction (first parent, first kid)
 *       - Useful when you want the immediate grader, not all graders up the tree
 * @returns {Object[]} Array of nodeInfos matching selector/inference/targets, deduped by id
 */
export function inferRelatedNodes(props, {
  selector,
  infer,
  targets,
  closest = false,
} = {}) {
  const { nodeInfo } = props;
  if (!nodeInfo) { console.log(props); throw new Error("inferRelatedNodes: props.nodeInfo is required"); };
  if (!selector) throw new Error("inferRelatedNodes: selector is required");

  // See above for logic and docstring
  const targetIds = normalizeTargetIds(targets);
  const inferModes = normalizeInfer(
    infer,
    (targets ? [] : ['parents', 'kids']) // default: infer if no targets, else don't
  );

  // Extract each group separately
  const explicitTargets = targetIds ? targetIds : [];

  let parents = [];
  if (inferModes.includes('parents')) {
    const allParents = getParents(nodeInfo, { selector, includeRoot: false });
    // getParents returns nearest-first, so [0] is the closest parent
    parents = closest && allParents.length > 0
      ? [getNodeId(allParents[0], 'inferRelatedNodes (parents)')]
      : allParents.map(n => getNodeId(n, 'inferRelatedNodes (parents)'));
  }

  let kids = [];
  if (inferModes.includes('kids')) {
    const allKids = getKidsBFS(nodeInfo, { selector, includeRoot: false });
    // BFS returns nearest-first, so [0] is the closest kid
    kids = closest && allKids.length > 0
      ? [getNodeId(allKids[0], 'inferRelatedNodes (kids)')]
      : allKids.map(n => getNodeId(n, 'inferRelatedNodes (kids)'));
  }

  // Combine all IDs and deduplicate using Set
  return [...new Set([...explicitTargets, ...parents, ...kids])];
}

/**
 * Get the related grader ID. Finds the nearest grader (closest in hierarchy).
 *
 * @param {Object} props - Component props with nodeInfo and optional target attribute
 * @param {Object} [options] - Optional overrides
 * @param {string|string[]} [options.infer] - Override inference direction ('parents', 'kids', or both)
 * @returns {string} Grader ID
 * @throws {Error} If no grader found or multiple graders found at same level
 */
export function getGrader(props, { infer } = {}) {
  const ids = inferRelatedNodes(props, {
    selector: n => n.blueprint?.isGrader,
    targets: props.target,
    infer,
    closest: true  // Find nearest grader, not all graders up the tree
  });
  if (ids.length === 0) {
    throw new Error(
      `No grader found. Place this block inside a grader, or add target="grader_id".`
    );
  }
  if (ids.length > 1) {
    // Can still get multiple if there's one in parents AND one in kids
    throw new Error(
      `Ambiguous grader reference: found ${ids.length} graders (${ids.join(', ')}). ` +
      `Add target="grader_id" to specify which one.`
    );
  }
  return ids[0];
}

/**
 * Get all related input IDs.
 *
 * @param {Object} props - Component props with nodeInfo and optional target attribute
 * @param {Object} [options] - Optional overrides
 * @param {string|string[]} [options.infer] - Override inference direction ('parents', 'kids', or both)
 * @returns {string[]} Array of input IDs (may be empty)
 */
export function getInputs(props, { infer } = {}) {
  return inferRelatedNodes(props, {
    selector: n => n.blueprint?.isInput,
    targets: props.target,
    infer
  });
}

// TODO: These functions belong in a new utility module (perhaps blocks/util.js)
// They handle runtime value resolution and mixed content processing, which
// is distinct from the DOM traversal utilities above.

/**
 * Get the current value of a component by ID using its getValue method.
 *
 * @param {Object} props - Component props with idMap and componentMap
 * @param {string} id - ID of the component to get value from
 * @returns {Promise<any>} The component's current value
 */
export async function getValueById(props, id) {
  const blockNode = props.idMap[id];
  const blockBlueprint = props.componentMap[blockNode.tag];

  if (blockBlueprint.getValue) {
    // Use the block's getValue method to get the actual value
    const reduxLogger = await import('lo_event/lo_event/reduxLogger.js');
    const state = reduxLogger.store.getState();

    const blockValue = await blockBlueprint.getValue(
      props,
      state,
      id
    );
    return blockValue;
  } else {
    console.warn(`⚠️ getValueById: Block ${blockNode.tag} (${id}) has no getValue method`);
  }
}

/**
 * Extract text from child nodes, resolving block references to their current values.
 *
 * For text nodes, accumulates the text content.
 * For block nodes, calls their getValue() method to get current runtime value.
 *
 * Originally designed to extract prompt text from LLMAction content.
 *
 * @param {Object} props - Component props with idMap and componentMap
 * @param {Object} actionNode - Node with kids array to process
 * @returns {Promise<string>} The extracted and resolved text content
 */
export async function extractChildText(props, actionNode) {
  const { kids = [] } = actionNode;
  let promptText = '';

  for (const [index, kid] of kids.entries()) {
    if (typeof kid === 'string') {
      promptText += kid;
    } else if (kid.type === 'text') {
      promptText += kid.text;
    } else if (kid.type === 'block') {
      const value = await getValueById(props, kid.id);
      if(value) {
        promptText += value;
      } // TODO: else -- maybe recurse down?
    } else {
      console.warn(`❓ extractChildText: Unknown kid type:`, kid);
    }
  }
  return promptText.trim();
}

export const __testables = {
  normalizeTargetIds,
  normalizeInfer
};
