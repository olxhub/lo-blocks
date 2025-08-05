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
import htmlTags from 'html-tags';
import React from 'react';
import { DisplayError, DebugWrapper } from '@/lib/util/debug';
import { COMPONENT_MAP } from '@/components/componentMap';

export const makeRootNode = () => ({ sentinel: 'root', renderedKids: {} });

// Main render function: handles single nodes, strings, JSX, and blocks
export function render({ node, idMap, key, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' }) {
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
    const entry = idMap?.[node];
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
    const entry = idMap?.[node.id];
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

  return (
    <DebugWrapper props={wrapperProps} blueprint={componentMap[tag].blueprint}>
      <Component
        { ...attributes }
        kids={ kids }
        idMap={ idMap }
        blueprint={ componentMap[tag].blueprint }
        fields={ componentMap[tag].blueprint?.fields?.fieldInfoByField }
        nodeInfo={ childNodeInfo }
        componentMap={ componentMap }
        idPrefix={ idPrefix }
      />
    </DebugWrapper>
  );
}


// Render kids array that may include: text, JSX, OLX, etc.
export function renderCompiledKids( props ) {
  let { kids, children, idMap, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '' } = props;
  if (kids === undefined && children !== undefined) {
    console.log(
      "[renderCompiledKids] WARNING: 'children' prop used instead of 'kids'. Please migrate to 'kids'."
    );
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


  return keyedKids.map((child, i) => {
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
            {render({ node: child, idMap, key: `${child.key}`, nodeInfo, componentMap, idPrefix })}
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
          renderCompiledKids({ kids: child.kids ?? [], idMap, nodeInfo, componentMap, idPrefix })
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
  });
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
