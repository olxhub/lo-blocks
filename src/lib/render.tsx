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
// render() and renderCompiledKids() return cached thenables to support async
// fetching of blocks not in the local idMap. Components should use the useKids()
// hook rather than calling use(renderCompiledKids(...)) directly.
//
// IMPORTANT: These functions return cached thenables to work with React's use().
// React's use() hook requires the same promise instance across re-renders, otherwise
// it suspends every time. We cache by idMap + kids IDs + idPrefix.
//
import htmlTags from 'html-tags';
import React, { use } from 'react';
import { DisplayError, DebugWrapper } from '@/lib/util/debug';
import { COMPONENT_MAP } from '@/components/componentMap';
import type { OlxKey } from '@/lib/types';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { getGrader } from '@/lib/blocks/olxdom';
import { getBlockByOLXId } from '@/lib/blocks/getBlockByOLXId';
import { assignReactKeys, cacheKey as nodeCacheKeyBase } from '@/lib/blocks/idResolver';

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
 * Generate cache key for kids array.
 * Uses cacheKey for each child, joined with commas.
 */
function kidsCacheKey(kids, idPrefix) {
  if (!Array.isArray(kids)) return idPrefix ? `invalid.${idPrefix}` : 'invalid';
  const kidsKey = kids.map(k => {
    if (k == null) return 'null';
    if (typeof k === 'string') return `s.${k}`;
    if (typeof k !== 'object') return `p.${String(k)}`;
    return nodeCacheKeyBase(k, { idPrefix: '' });
  }).join(',');
  return idPrefix ? `${kidsKey}.${idPrefix}` : kidsKey;
}

/**
 * Generate cache key for render() from node.
 * Handles arrays and object nodes ({ type: 'block', id } or { tag, id, ... }).
 * See idResolver.js for cacheKey documentation.
 */
function nodeCacheKey(node, idPrefix) {
  // Array of kids
  if (Array.isArray(node)) {
    const arrKey = kidsCacheKey(node, '');
    return idPrefix ? `arr.${idPrefix}.${arrKey}` : `arr.${arrKey}`;
  }

  // Object nodes - use cacheKey from idResolver (includes overrides!)
  if (typeof node === 'object' && node !== null) {
    if (!node.id && !node.tag) {
      throw new Error('render: object node missing id or tag');
    }
    return nodeCacheKeyBase(node, { idPrefix });
  }

  throw new Error(`render: unexpected node type: ${typeof node}`);
}

// Root sentinel has minimal blueprint so selectors don't need ?. checks
// TODO: Give root a real blueprint created via blocks.core() for consistency
const ROOT_BLUEPRINT = Object.freeze({ name: 'Root', isGrader: false, isInput: false });
export const makeRootNode = () => ({ sentinel: 'root', renderedKids: {}, blueprint: ROOT_BLUEPRINT });

// Main render function: handles structured nodes and block references.
// Returns a cached thenable to work with React's use() hook.
// React requires the same thenable instance across re-renders.
//
// Node types accepted:
//   - { type: 'block', id, overrides? } - reference to block in idMap
//   - { tag, id, attributes, kids } - inline OLX node
//   - Array of kids - rendered via renderCompiledKids
export function render({ node, idMap, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' }) {
  // Handle null - return singleton thenable (callers may use(render(...)))
  if (!node) return NULL_RENDER_THENABLE;

  // JSX should not be passed to render() - the OLX pipeline produces structured nodes
  if (React.isValidElement(node)) {
    throw new Error('render(): JSX element passed directly. Use structured nodes from OLX parser.');
  }

  // Get or create cache for this idMap
  let cacheForIdMap = renderCache.get(idMap);
  if (!cacheForIdMap) {
    cacheForIdMap = new Map();
    renderCache.set(idMap, cacheForIdMap);
  }

  const key = nodeCacheKey(node, idPrefix);

  // Return cached thenable if available
  if (cacheForIdMap.has(key)) {
    return cacheForIdMap.get(key);
  }

  // Create thenable that will be cached
  // Type annotation needed because status/value/promise change after initialization
  const thenable: {
    status: string;
    value: any;
    reason: any;
    _promise: Promise<any> | null;
    then: (onFulfilled?: any, onRejected?: any) => void;
  } = {
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
      this._promise!.then(onFulfilled, onRejected);
    }
  };

  // Start render immediately and update thenable when done
  thenable._promise = renderInternal({ node, idMap, nodeInfo, componentMap, idPrefix }).then(
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

  cacheForIdMap.set(key, thenable);
  return thenable;
}

// Internal render implementation - dispatches by node type
async function renderInternal({ node, idMap, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' }) {
  if (!node) return null;

  // Handle list of kids
  if (Array.isArray(node)) {
    return renderCompiledKids({ kids: node, idMap, nodeInfo, componentMap, idPrefix });
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
    return render({ node: entryWithOverrides, idMap, nodeInfo, componentMap, idPrefix });
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

  const blockType = componentMap[tag];
  const Component = blockType.component;

  // Validate attributes - use component schema if defined, else base with passthrough
  const attrSchema = blockType.attributes ?? baseAttributes.passthrough();
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
    childNodeInfo = { node, renderedKids: {}, parent: nodeInfo, blueprint: blockType };
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
  let graderId: OlxKey | null = null;
  if (blockType.requiresGrader) {
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
    <DebugWrapper props={wrapperProps} blueprint={blockType}>
      <div className={combinedClassName} data-block-type={tag}>
        <Component
          { ...attributes }
          id={node.id}
          kids={ kids }
          idMap={ idMap }
          blueprint={ blockType }
          locals={ blockType.locals }
          fields={ blockType.fields }
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
// Internal function - components should use useKids() hook instead.
function renderCompiledKids(props) {
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

  const key = kidsCacheKey(kids, idPrefix);

  // Return cached thenable if available
  if (cacheForIdMap.has(key)) {
    return cacheForIdMap.get(key);
  }

  // Create thenable that will be cached
  // Start the internal render immediately - this allows it to resolve
  // before React's use() is called if all data is sync
  // Type annotation needed because status/value/promise change after initialization
  const thenable: {
    status: string;
    value: any;
    reason: any;
    _promise: Promise<any> | null;
    then: (onFulfilled?: any, onRejected?: any) => void;
  } = {
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
      this._promise!.then(onFulfilled, onRejected);
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

  cacheForIdMap.set(key, thenable);
  return thenable;
}

/**
 * Hook for rendering kids in a component.
 * Wraps renderCompiledKids with React's use() for cleaner component code.
 *
 * @param {object} props - Component props (must include idMap, nodeInfo, componentMap)
 * @returns {{ kids: React.ReactNode[] }} Object containing rendered kids
 *
 * @example
 * function MyComponent(props) {
 *   const { kids } = useKids(props);
 *   return <div>{kids}</div>;
 * }
 *
 * // With custom kids:
 * const { kids } = useKids({ ...props, kids: customKids });
 *
 * TODO: Add loading and error states for more explicit control than Suspense:
 *   const { kids, loading, error } = useKids(props);
 */
export function useKids(props): { kids: React.ReactElement[] } {
  const kids = use(renderCompiledKids(props)) as React.ReactElement[];
  return { kids };
}

/**
 * Hook for rendering a single block by OLX ID.
 * Fetches the block from idMap and renders it.
 *
 * @param {object} props - Component props (must include idMap, nodeInfo, componentMap)
 * @param {string} id - The OLX ID of the block to render
 * @returns {{ block: React.ReactNode }} Object containing rendered block
 *
 * @example
 * function MyComponent(props) {
 *   const { block } = useBlock(props, targetId);
 *   return <div>{block}</div>;
 * }
 */
export function useBlock(props, id) {
  const block = use(render({ ...props, node: { type: 'block', id } }));
  return { block };
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

    // JSX should not appear in kids array - parser produces structured nodes
    if (React.isValidElement(child)) {
      throw new Error('renderCompiledKids: JSX element in kids array. Use structured nodes from OLX parser.');
    }

    switch (child.type) {
      case 'block':
        return (
          <React.Fragment key={child.key}>
            {await render({ node: child, idMap, nodeInfo, componentMap, idPrefix })}
          </React.Fragment>
        );

      case 'text':
        return <span key={child.key}>{child.text}</span>;

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
 * Helper to render a virtual block without exposing OLX node shape.
 * Used for programmatically creating blocks (e.g., CapaProblem status icons).
 *
 * @param {object} props - Component props (must include idMap, nodeInfo, componentMap)
 * @param {string} tag - The component tag (e.g., 'Correctness')
 * @param {object} options - { id, ...attributes }
 * @param {Array} kids - Child nodes
 * @returns Thenable for the rendered block
 *
 * @example
 * renderBlock(props, 'Correctness', { id: 'x_status', target: '...' })
 */
export function renderBlock(props, tag, options: { id?: string; [key: string]: any } = {}, kids = []) {
  const { id, ...attributes } = options;
  const node = { id, tag, attributes, kids };
  return render({ ...props, node });
}
