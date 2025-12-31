// src/lib/render.jsx
//
// Rendering engine - transforms static OLX structure into dynamic rendered tree.
//
// Takes the static OLX DAG (idMap) and creates a dynamic rendered OLX DAG with
// active nodeInfo relationships. This is NOT a direct OLX → React transformation,
// but rather: Static OLX DAG → Dynamic Rendered OLX DAG → React components
//
// Key responsibilities:
// - Creates nodeInfo tree with parent/child relationships for actions system
// - Handles component mapping and props resolution
// - Manages ID resolution and prefixes for list contexts
// - Provides error boundaries for robust content display
// - Supports debugging wrappers for development
//
// The dynamic OLX structure enables the actions system to find related blocks
// and coordinate behaviors across the content hierarchy.
//
// render() and renderCompiledKids() are async to support fetching blocks that
// aren't in the local idMap. Components should use: use(renderCompiledKids(props))
//
// IMPORTANT: renderCompiledKids returns a cached thenable to work with React's use().
// React's use() hook requires the same promise instance across re-renders, otherwise
// it suspends every time. We cache by idMap + kids IDs + idPrefix.
//
import htmlTags from 'html-tags';
import React from 'react';
import { DisplayError, DebugWrapper } from '@/lib/util/debug';
import { COMPONENT_MAP } from '@/components/componentMap';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { getGrader } from '@/lib/blocks/olxdom';
import { getBlockByOLXId } from '@/lib/blocks/getBlockByOLXId';

// Cache for renderCompiledKids thenables, keyed by idMap then by kids+prefix
const renderKidsCache = new WeakMap();

// Cache for render() thenables, keyed by idMap then by node+prefix
const renderCache = new WeakMap();

// Singleton thenable for null nodes - must be same instance every time
// to satisfy React's use() hook requirement for stable thenable identity.
const NULL_RENDER_THENABLE = {
  status: 'fulfilled',
  value: null,
  then(onFulfilled) { if (onFulfilled) onFulfilled(null); }
};

/**
 * Generate a stable cache key from kids array and idPrefix.
 * Uses kid IDs/types rather than object identity for stability.
 */
function getRenderCacheKey(kids, idPrefix) {
  if (!Array.isArray(kids)) return `invalid|${idPrefix || ''}`;
  const kidsKey = kids.map(k => {
    if (k == null) return 'null';
    if (typeof k === 'string') return `s:${k}`;
    if (typeof k !== 'object') return `p:${String(k)}`;
    // For objects, use type+id as key
    return `${k.type || 'obj'}:${k.id || k.key || '?'}`;
  }).join(',');
  return `${kidsKey}|${idPrefix || ''}`;
}

/**
 * Generate a stable cache key for render() from node and idPrefix.
 * Precondition: node is not null/undefined and not a React element (handled before caching).
 *
 * IMPORTANT: String IDs and object nodes with the same ID must have DIFFERENT cache keys!
 * render("myblock") fetches the object then calls render(object), and if they share
 * a cache key, the outer thenable waits for inner which returns the same thenable → deadlock.
 */
function getNodeCacheKey(node, idPrefix) {
  // String node = ID reference that will be looked up in idMap
  // Prefix with 'ref:' to distinguish from resolved object nodes
  if (typeof node === 'string') return `ref:${node}|${idPrefix}`;

  // Array of kids
  if (Array.isArray(node)) return `arr:${getRenderCacheKey(node, '')}|${idPrefix}`;

  // Object nodes - the actual block data
  if (typeof node === 'object') {
    if (node.type === 'block') {
      if (!node.id) throw new Error('render: block node missing id');
      return `block:${node.id}|${idPrefix}`;
    }
    if (node.tag) {
      if (!node.id) throw new Error(`render: ${node.tag} node missing id`);
      return `tag:${node.id}|${idPrefix}`;
    }
    if (!node.id) throw new Error('render: object node missing id');
    return `obj:${node.id}|${idPrefix}`;
  }

  throw new Error(`render: unexpected node type: ${typeof node}`);
}

// Root sentinel has minimal blueprint so selectors don't need ?. checks
// TODO: Give root a real blueprint created via blocks.core() for consistency
const ROOT_BLUEPRINT = Object.freeze({ name: 'Root', isGrader: false, isInput: false });
export const makeRootNode = () => ({ sentinel: 'root', renderedKids: {}, blueprint: ROOT_BLUEPRINT });

// Main render function: handles single nodes, strings, JSX, and blocks
// Returns a cached thenable to work with React's use() hook.
// React requires the same thenable instance across re-renders.
export function render({ node, idMap, key, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' }) {
  // Handle null - return singleton thenable (callers may use(render(...)))
  if (!node) return NULL_RENDER_THENABLE;

  // JSX passthrough - wrap in fulfilled thenable for use() compatibility
  // Note: Creates new thenable each time, but JSX passthrough is rare
  // and typically not in hot render paths
  if (React.isValidElement(node)) {
    return {
      status: 'fulfilled',
      value: node,
      then(onFulfilled) { if (onFulfilled) onFulfilled(node); }
    };
  }

  // Get or create cache for this idMap
  let cacheForIdMap = renderCache.get(idMap);
  if (!cacheForIdMap) {
    cacheForIdMap = new Map();
    renderCache.set(idMap, cacheForIdMap);
  }

  const cacheKey = getNodeCacheKey(node, idPrefix);

  // Return cached thenable if available
  if (cacheForIdMap.has(cacheKey)) {
    return cacheForIdMap.get(cacheKey);
  }

  // Create thenable that will be cached
  const thenable = {
    status: 'pending',
    value: undefined,
    reason: undefined,
    _promise: null,
    then(onFulfilled, onRejected) {
      if (this.status === 'fulfilled') {
        if (onFulfilled) onFulfilled(this.value);
        return;
      }
      if (this.status === 'rejected') {
        if (onRejected) onRejected(this.reason);
        return;
      }
      this._promise.then(onFulfilled, onRejected);
    }
  };

  // Start render immediately and update thenable when done
  thenable._promise = renderInternal({ node, idMap, key, nodeInfo, componentMap, idPrefix }).then(
    result => {
      thenable.status = 'fulfilled';
      thenable.value = result;
      return result;
    },
    err => {
      thenable.status = 'rejected';
      thenable.reason = err;
      console.error('[render] Error:', err);
      throw err;
    }
  );

  cacheForIdMap.set(cacheKey, thenable);
  return thenable;
}

// Internal render implementation
async function renderInternal({ node, idMap, key, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' }) {
  if (!node) return null;
  // JSX passthrough
  if (React.isValidElement(node)) return node;

  // Handle list of kids
  if (Array.isArray(node)) {
    return renderCompiledKids({ kids: node, idMap, nodeInfo, componentMap, idPrefix });
  }

  // Handle string ID,
  //
  // This path may be deprecated, as we're moving towards always
  // having { type: 'block', id: [id] } for where we once used this.
  if (typeof node === 'string') {
    const entry = await getBlockByOLXId({ idMap }, node);
    if (!entry) {
      return (
        <DisplayError
          id={`missing-id-${node}`}
          name="render"
          message={`Could not resolve node ID "${node}" in idMap`}
          data={{ node, idMap }}
        />
      );
    }
    return render({ node: entry, idMap, key, nodeInfo, componentMap, idPrefix });
  }

  // Handle { type: 'block', id, overrides }
  if (
    typeof node === 'object' &&
    node !== null &&
    node.type === 'block' &&
    typeof node.id === 'string'
  ) {
    const entry = await getBlockByOLXId({ idMap }, node.id);
    if (!entry) {
      return (
        <DisplayError
          id={`missing-id-${node.id}`}
          name="render"
          message={`Could not resolve block ID "${node.id}" in idMap`}
          data={{ node, idMap }}
        />
      );
    }
    const entryWithOverrides = node.overrides
      ? { ...entry, attributes: { ...entry.attributes, ...node.overrides } }
      : entry;
    return render({ node: entryWithOverrides, idMap, key, nodeInfo, componentMap, idPrefix });
  }

  // Handle structured OLX-style node
  const { tag, attributes = {}, kids = [] } = node;

  if (!componentMap[tag] || ! componentMap[tag].component) {
    return (
      <DisplayError
        id={`unknown-tag-${tag}`}
        name="render"
        message={`No component found for tag "${tag}"`}
        data={node}
      />
    );
  }

  const Component = componentMap[tag].component;
  const blueprint = componentMap[tag].blueprint;

  // Validate attributes - use component schema if defined, else base with passthrough
  const attrSchema = blueprint?.attributes ?? baseAttributes.passthrough();
  const validationResult = attrSchema.safeParse(attributes);
  if (!validationResult.success) {
    const zodErrors = validationResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    return (
      <DisplayError
        id={`validation-${node.id}`}
        name={tag}
        message={`Invalid attributes: ${zodErrors}`}
        technical={{ attributes, zodError: validationResult.error }}
      />
    );
  }

  // Create a dynamic shadow hierarchy
  //
  // Note if the same component appears multiple times, we only include it once.
  //
  // I'm not sure if that's a bug or a feature. For <Use> we will only have one element.
  //
  // This is because render() can be called multiple times (e.g. in Strict mode)
  //
  // TODO: Check if this causes extra renders, and if we need to memoize anything
  let childNodeInfo = nodeInfo.renderedKids[node.id];
  if (!childNodeInfo) {
    childNodeInfo = { node, renderedKids: {}, parent: nodeInfo, blueprint: componentMap[tag].blueprint };
    nodeInfo.renderedKids[node.id] = childNodeInfo;
  }

  const wrapperProps = {
    ...attributes,
    id: node.id,
    nodeInfo: childNodeInfo,
    componentMap,
    idPrefix
  };

  // Check requiresGrader - inject graderId or show error
  let graderId = null;
  if (blueprint?.requiresGrader) {
    try {
      graderId = getGrader({ ...wrapperProps, idMap });
    } catch (e) {
      return (
        <DisplayError
          id={`grader-required-${node.id}`}
          name={tag}
          message={e.message}
          technical={{ blockId: node.id, requiresGrader: true }}
        />
      );
    }
  }

  // Generate CSS classes for theming system
  const blockClassName = `lo-tag-${tag.toLowerCase()}`;
  // TODO: We might add lo-id-... and other classes as well, to refer to specific components
  // later
  const userClassName = attributes.class || '';
  const combinedClassName = `${blockClassName} ${userClassName}`.trim();

  // TODO: We probably want more than just data-block-type. Having IDs, etc. will be
  // very nice for debugging and introspectoin.

  // TODO: Should the wrapper be a <div> or a <span>?
  return (
    <DebugWrapper props={wrapperProps} blueprint={componentMap[tag].blueprint}>
      <div className={combinedClassName} data-block-type={tag}>
        <Component
          { ...attributes }
          id={node.id}
          kids={ kids }
          idMap={ idMap }
          blueprint={ componentMap[tag].blueprint }
          locals={ componentMap[tag].locals }
          fields={ componentMap[tag].blueprint?.fields?.fieldInfoByField }
          nodeInfo={ childNodeInfo }
          componentMap={ componentMap }
          idPrefix={ idPrefix }
          { ...(graderId && { graderId }) }
        />
      </div>
    </DebugWrapper>
  );
}


// Render kids array that may include: text, JSX, OLX, etc.
// Returns a cached thenable to work with React's use() hook.
// Components should use: use(renderCompiledKids(props))
export function renderCompiledKids(props) {
  let { kids, children, idMap, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' } = props;
  if (kids === undefined && children !== undefined) {
    console.log(
      "[renderCompiledKids] WARNING: 'children' prop used instead of 'kids'. Please migrate to 'kids'."
    );
    kids = children;
  }

  // Get or create cache for this idMap
  let cacheForIdMap = renderKidsCache.get(idMap);
  if (!cacheForIdMap) {
    cacheForIdMap = new Map();
    renderKidsCache.set(idMap, cacheForIdMap);
  }

  const cacheKey = getRenderCacheKey(kids, idPrefix);

  // Return cached thenable if available
  if (cacheForIdMap.has(cacheKey)) {
    return cacheForIdMap.get(cacheKey);
  }

  // Create thenable that will be cached
  // Start the internal render immediately - this allows it to resolve
  // before React's use() is called if all data is sync
  const thenable = {
    status: 'pending',
    value: undefined,
    reason: undefined,
    _promise: null,
    then(onFulfilled, onRejected) {
      if (this.status === 'fulfilled') {
        // Sync resolution - call callback immediately
        if (onFulfilled) onFulfilled(this.value);
        return;
      }
      if (this.status === 'rejected') {
        if (onRejected) onRejected(this.reason);
        return;
      }
      // Still pending - chain to the promise
      this._promise.then(onFulfilled, onRejected);
    }
  };

  // Start render immediately and update thenable when done
  thenable._promise = renderCompiledKidsInternal(props).then(
    result => {
      thenable.status = 'fulfilled';
      thenable.value = result;
      return result;
    },
    err => {
      thenable.status = 'rejected';
      thenable.reason = err;
      console.error('[renderCompiledKids] Error in internal render:', err);
      throw err;
    }
  );

  cacheForIdMap.set(cacheKey, thenable);
  return thenable;
}

// Internal async implementation of renderCompiledKids
async function renderCompiledKidsInternal(props) {
  let { kids, children, idMap, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' } = props;
  if (kids === undefined && children !== undefined) {
    kids = children;
  }

  if (!Array.isArray(kids)) {
    console.log(kids);
    return [
      <DisplayError
        key="invalid-kids-type"
        name="renderCompiledKids"
        message={`Expected kids to be an array, got ${typeof kids}`}
        data={kids}
      />
    ];
  }

  const keyedKids = assignReactKeys(kids);

  // Process all children, awaiting any async renders
  const renderedKids = await Promise.all(keyedKids.map(async (child, i) => {
    if (typeof child === 'string') {
      return <React.Fragment key={`string-${i}`}>{child}</React.Fragment>;
    }

    if (React.isValidElement(child)) {
      return <React.Fragment key={child.key}>{child}</React.Fragment>;
    }

    switch (child.type) {
      case 'block':
        return (
          <React.Fragment key={child.key}>
            {await render({ node: child, idMap, key: `${child.key}`, nodeInfo, componentMap, idPrefix })}
          </React.Fragment>
        );

      case 'text':
        return <span key={child.key}>{child.text}</span>;

      case 'xml':
        return (
          <pre key={child.key} className="bg-gray-50 p-2 rounded text-sm overflow-auto">
            {child.xml}
          </pre>
        );

      case 'cdata':
        return (
          <pre key={child.key} className="bg-yellow-50 p-2 rounded text-sm overflow-auto">
            {child.value}
          </pre>
        );

      case 'html':
        // React fails -- spectacularly -- on invalid HTML tags.
        if (!htmlTags.includes(child.tag)) {
           return(<p> Invalid tag: {child.tag} </p>);
        }
        return React.createElement(
          child.tag,
          { key: child.key, ...child.attributes },
          await renderCompiledKidsInternal({ kids: child.kids ?? [], idMap, nodeInfo, componentMap, idPrefix })
        );

      case 'node':
        return (
          <pre key={child.key} className="bg-blue-50 p-2 rounded text-xs text-gray-700 overflow-auto">
            {JSON.stringify(child.rawParsed, null, 2)}
          </pre>
        );

      default:
        return (
          <DisplayError
            key={child.key}
            name="renderCompiledKids"
            message={`Unknown child type: "${child.type}"`}
            data={child}
          />
        );
    }
  }));

  return renderedKids;
}


/**
 * assignReactKeys
 * ----------------
 * Assigns unique React keys to an array of child data, ensuring stability and uniqueness
 * even if some children share the same id property.
 *
 * Rationale:
 * React requires unique keys for each child element in a list to efficiently reconcile changes
 * and preserve component identity and state. In OLX/edX-style data, nodes may share the same
 * id (e.g., for repeated references in a DAG), so we generate keys by appending a stable, deterministic
 * suffix to duplicates (e.g., "foo", "foo.1", "foo.2"). If a child already has a "key" property,
 * an exception is thrown to avoid accidental double-keying.
 *
 * Note: This does not guarantee stability if the *order* of repeated ids changes, but for most
 * DAG-like OLX data, this is sufficient. If you need reordering stability, consider a persistent
 * unique identifier per node.
 *
 * Example:
 *   Input:
 *     [
 *       { id: "foo" },
 *       { id: "bar" },
 *       { id: "foo" },
 *       { id: "baz" },
 *       { id: "foo" }
 *     ]
 *
 *   Output:
 *     [
 *       { id: "foo", key: "foo" },
 *       { id: "bar", key: "bar" },
 *       { id: "foo", key: "foo.1" },
 *       { id: "baz", key: "baz" },
 *       { id: "foo", key: "foo.2" }
 *     ]
 *
 * Key Assignment Table:
 *
 * | Scenario                  | Key Example      | Uniqueness | Stability on reorder |
 * |---------------------------|------------------|------------|---------------------|
 * | Unique id in siblings     | "foo"            | Yes        | Yes                 |
 * | Duplicate id in siblings  | "foo", "foo.1"   | Yes        | No                  |
 * | No id property            | "__idx__0"       | Yes        | Yes                 |
 *
 * @param {Array<object>} children - Array of child objects, each optionally with an 'id'
 * @returns {Array<object>} - New array of children with unique 'key' property assigned
 *
 * @throws {Error} If a child already has a 'key' property.
 *
 * TODO:
 * * Move to a more logical place in the code
 * * Add runner for test case below
 */
function assignReactKeys(children) {
  const idCounts = {};
  return children.map((child, i) => {
    if (child == null || typeof child !== 'object') {
      // Pass through primitives and non-objects unchanged
      return child;
    }
    if ('key' in child) {
      // We might consider allowing keys to be assigned upstream, but perhaps
      // we'll use a _reactKey instead.
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
        key = `${child.id}.${idCounts[child.id]}`;
        idCounts[child.id]++;
      }
    } else {
      key = `__idx__${i}`;
    }
    return { ...child, key };
  });
}


export const __testables = {
  assignReactKeys,
};
