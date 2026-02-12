// src/lib/blocks/olxdom.ts
//
// OLX DOM traversal - navigation utilities for the Learning Observer
// dynamic content DAG.

import * as state from '@/lib/state';
import { refToOlxKey, toOlxReference } from './idResolver';
import type { OlxDomNode, OlxDomSelector, OlxKey, OlxReference, RuntimeProps } from '@/lib/types';
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
 * Build event context path by walking up the nodeInfo tree.
 * Returns dot-separated IDs from root to current node.
 *
 * Used to scope events to their location in the OLX DOM hierarchy.
 * Example: "preview.quiz.problem_5"
 *
 * @param nodeInfo - The current nodeInfo
 * @returns Dot-separated context path
 */
export function getEventContext(nodeInfo: OlxDomNode | null | undefined): string {
  const ids: string[] = [];
  let current = nodeInfo;
  while (current) {
    // Get ID from nodeInfo or its node
    const id = (current as any).id ?? current.olxJson?.id;
    if (id) ids.unshift(id);
    current = current.parent;
  }
  return ids.join('.');
}

/**
 * Traverses up the parent chain, returning all parent nodeInfos
 * that match the selector function. Closest parent first.
 *
 * @param {Object} nodeInfo - The starting nodeInfo
 * @param {Function} selector - Predicate on nodeInfo (default: always true)
 * @returns {Array} Array of matching parent nodeInfos
 */
export function getParents(nodeInfo: OlxDomNode, { selector = (_: OlxDomNode) => true, includeRoot = false }: { selector?: OlxDomSelector; includeRoot?: boolean } = {}) {
  const results: OlxDomNode[] = [];
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
export function getKidsBFS(nodeInfo: OlxDomNode, { selector = (_: OlxDomNode) => true, includeRoot = false }: { selector?: OlxDomSelector; includeRoot?: boolean } = {}) {
  const results: OlxDomNode[] = [];
  const queue: OlxDomNode[] = includeRoot
    ? [nodeInfo]
    : Object.values(nodeInfo.renderedKids ?? {});

  while (queue.length) {
    const current = queue.shift()!;  // Safe: queue.length > 0
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
export function getKidsDFS(nodeInfo: OlxDomNode, { selector = (_: OlxDomNode) => true, includeRoot = false }: { selector?: OlxDomSelector; includeRoot?: boolean } = {}) {
  const results: OlxDomNode[] = [];
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
 * @param {any} targets - Target attribute from OLX (user-authored references)
 * @returns {OlxReference[] | false}
 */
function normalizeTargetIds(targets): OlxReference[] | false {
  if (!targets) return false; // Target was not specified
  if (targets === true) throw new Error('Boolean true is not a valid target');
  // User input from OLX - validate and brand as references
  if (Array.isArray(targets)) {
    return targets.map(t => toOlxReference(String(t), 'target attribute'));
  }
  if (typeof targets === "string") {
    return targets.split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => toOlxReference(s, 'target attribute'));
  }
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


function root(nodeInfo: OlxDomNode): OlxDomNode {
  while (nodeInfo.parent) nodeInfo = nodeInfo.parent;
  return nodeInfo;
}

/**
 * Safely extract node ID from a nodeInfo, with helpful error for debugging.
 * @param {Object} nodeInfo - The nodeInfo to get ID from
 * @param {string} context - Description of what operation is being performed
 * @returns {string} The node ID
 * @throws {Error} If nodeInfo.olxJson or nodeInfo.olxJson.id is missing
 */
function getNodeId(nodeInfo: OlxDomNode, context = 'getNodeId'): OlxKey {
  if (!nodeInfo.olxJson) {
    // Root node has sentinel instead of olxJson
    if (nodeInfo.sentinel === 'root') {
      throw new Error(
        `${context}: Attempted to get ID from root sentinel node. ` +
        `This usually means a selector matched the root (blueprint.name === 'Root'). ` +
        `Selectors should filter out the root node.`
      );
    }
    throw new Error(
      `${context}: nodeInfo.olxJson is undefined. nodeInfo keys: [${Object.keys(nodeInfo).join(', ')}]`
    );
  }
  if (nodeInfo.olxJson.id === undefined) {
    throw new Error(
      `${context}: nodeInfo.olxJson.id is undefined. olxJson keys: [${Object.keys(nodeInfo.olxJson).join(', ')}], ` +
      `tag: ${nodeInfo.olxJson.tag || 'N/A'}`
    );
  }
  return nodeInfo.olxJson.id;
}

export function getAllNodes(nodeInfo: OlxDomNode, { selector = (_: OlxDomNode) => true }: { selector?: OlxDomSelector } = {}) {
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
export function inferRelatedNodes(props: RuntimeProps, {
  selector,
  infer,
  targets,
  closest = false,
}: { selector?: OlxDomSelector; infer?; targets?; closest?: boolean } = {}): OlxKey[] {
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
  // Resolve OlxReferences to OlxKeys for idMap lookup
  const explicitTargets: OlxKey[] = targetIds ? targetIds.map(ref => refToOlxKey(ref)) : [];

  let parents: OlxKey[] = [];
  if (inferModes.includes('parents')) {
    const allParents = getParents(nodeInfo, { selector, includeRoot: false });
    // getParents returns nearest-first, so [0] is the closest parent
    parents = closest && allParents.length > 0
      ? [getNodeId(allParents[0], 'inferRelatedNodes (parents)')]
      : allParents.map(n => getNodeId(n, 'inferRelatedNodes (parents)'));
  }

  let kids: OlxKey[] = [];
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
export function getGrader(props: RuntimeProps, { infer }: { infer? } = {}): OlxKey {
  const ids = inferRelatedNodes(props, {
    selector: n => n.loBlock.isGrader,
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
export function getInputs(props, { infer }: { infer? } = {}) {
  return inferRelatedNodes(props, {
    selector: n => n.loBlock.isInput,
    targets: props.target,
    infer
  });
}


// TODO: These functions belong in a new utility module (perhaps blocks/util.js)
// They handle runtime value resolution and mixed content processing, which
// is distinct from the DOM traversal utilities above.

/**
 * Get the current value of a component by ID.
 *
 * Delegates to the state module's valueSelector which handles all ID
 * resolution complexity (prefixes, absolute paths, etc.) transparently.
 *
 * @param props - Component props with blockRegistry and store
 * @param id - ID of the component to get value from
 * @returns The component's current value
 */
export function getValueById(props: RuntimeProps, id: OlxReference | null | undefined) {
  const reduxState = props.runtime.store.getState();

  // valueSelector handles all ID resolution (refToOlxKey for lookup, proper
  // prefix handling for state access) - blocks don't need to know about IDs
  return state.valueSelector(props, reduxState, id);
}

/**
 * Extract text from child nodes, resolving block references to their current values.
 *
 * For text nodes, accumulates the text content.
 * For block nodes, calls their getValue() method to get current runtime value.
 *
 * Originally designed to extract prompt text from LLMAction content.
 *
 * @param {Object} props - Component props with blockRegistry
 * @param {Object} actionNode - Node with kids array to process
 * @returns {string} The extracted and resolved text content
 */
export function extractChildText(props, actionNode) {
  const { kids = [] } = actionNode;
  let promptText = '';

  for (const kid of kids) {
    if (typeof kid === 'string') {
      promptText += kid;
    } else if (kid.type === 'text') {
      promptText += kid.text;
    } else if (kid.type === 'block') {
      const value = getValueById(props, kid.id);
      if (value) {
        promptText += value;
      } // TODO: else -- maybe recurse down?
    } else {
      console.warn(`❓ extractChildText: Unknown kid type:`, kid);
    }
  }
  return promptText.trim();
}

// =============================================================================
// DESIGN: Runtime Context in NodeInfo (IMPLEMENTED)
// =============================================================================
//
// Each OlxDomNode stores its runtime context (idPrefix, logEvent, etc.)
// captured at render time. When actions/graders find related blocks, they
// read runtime from the target's nodeInfo rather than copying the caller's.
//
// - render.tsx: stores finalRuntime on childNodeInfo during render
// - actions.tsx: reads nodeInfo.runtime for input and action props
// - OlxDomNode.runtime: required field on the type (src/lib/types.ts)
//

export const __testables = {
  normalizeTargetIds,
  normalizeInfer
};
