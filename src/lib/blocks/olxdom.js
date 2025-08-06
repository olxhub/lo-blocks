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
 * @returns {Object[]} Array of nodeInfos matching selector/inference/targets, deduped by id
 */
export function inferRelatedNodes(props, {
  selector,
  infer,
  targets,
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

  const parents = inferModes.includes('parents')
        ? getParents(nodeInfo, { selector, includeRoot: false }).map(n => n.node.id)
        : [];

  const kids = inferModes.includes('kids')
        ? getKidsBFS(nodeInfo, { selector, includeRoot: false }).map(n => n.node.id)
        : [];

  // Combine all IDs and deduplicate using Set
  return [...new Set([...explicitTargets, ...parents, ...kids])];
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
    // TODO: Top-level import? I think this await is just a relic of where this came from.
    const reduxLogger = await import('lo_event/lo_event/reduxLogger.js');
    const state = reduxLogger.store.getState()?.application_state || {};

    const blockValue = await blockBlueprint.getValue(
      state.component,
      id,
      blockNode.attributes,
      props.idMap
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
