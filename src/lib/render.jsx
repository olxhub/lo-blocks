import React from 'react';
import { DisplayError } from '@/lib/debug';
import { COMPONENT_MAP } from '@/components/componentMap';

export const makeRootNode = () => ({ sentinel: 'root', renderedChildren: {} });

// Main render function: handles single nodes, strings, JSX, and blocks
export function render({ node, idMap, key, nodeInfo, debug }) {
  if (!node) return null;

  // JSX passthrough
  if (React.isValidElement(node)) return node;

  // Handle list of children
  if (Array.isArray(node)) {
    return renderCompiledChildren({ kids: node, idMap, nodeInfo, debug });
  }

  // Handle string ID,
  //
  // This path may be deprecated, as we're moving towards always
  // having { type: 'xblock', id: [id] } for where we once used this.
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
    return render({ node: entry, idMap, key, nodeInfo, debug });
  }

  // Handle { type: 'xblock', id }
  // We should also support overrides in the near future.
  if (
    typeof node === 'object' &&
    node !== null &&
    node.type === 'xblock' &&
    typeof node.id === 'string'
  ) {
    const entry = idMap?.[node.id];
    if (!entry) {
      return (
        <DisplayError
          id={`missing-id-${node.id}`}
          name="render"
          message={`Could not resolve xblock ID "${node.id}" in idMap`}
          data={{ node, idMap }}
        />
      );
    }
    return render({ node: entry, idMap, key, nodeInfo, debug });
  }

  // Handle structured OLX-style node
  const { tag, attributes = {}, children = [] } = node;

  if (!COMPONENT_MAP[tag] || ! COMPONENT_MAP[tag].component) {
    return (
      <DisplayError
        id={`unknown-tag-${tag}`}
        name="render"
        message={`No component found for tag "${tag}"`}
        data={node}
      />
    );
  }

  const Component = COMPONENT_MAP[tag].component;

  // Create a dynamic shadow hierarchy
  //
  // Note if the same component appears multiple times, we only include it once.
  //
  // I'm not sure if that's a bug or a feature. For <Use> we will only have one element.
  //
  // This is because render() can be called multiple times (e.g. in Strict mode)
  //
  // TODO: Check if this causes extra renders, and if we need to memoize anything
  let childNodeInfo = nodeInfo.renderedChildren[node.id];
  if (!childNodeInfo) {
    childNodeInfo = { node, renderedChildren: {}, parent: nodeInfo };
    nodeInfo.renderedChildren[node.id] = childNodeInfo;
  }

  return (
    <Component
      { ...attributes }
      kids={ children }
      idMap={ idMap }
      spec={ COMPONENT_MAP[tag].spec }
      fields={ COMPONENT_MAP[tag].spec?.fieldToEventMap?.fields }
      nodeInfo={ childNodeInfo }
      debug={ debug }
    />
  );
}


// Render children array that may include: text, JSX, OLX, etc.
export function renderCompiledChildren( params ) {
  let { kids, children, idMap, nodeInfo, debug } = params;
  if (kids === undefined && children !== undefined) {
    console.log(
      "[renderCompiledChildren] WARNING: 'children' prop used instead of 'kids'. Please migrate to 'kids'."
    );
    kids = children;
  }

  if (!Array.isArray(kids)) {
    return [
      <DisplayError
        name="renderCompiledChildren"
        message={`Expected kids to be an array, got ${typeof kids}`}
        data={kids}
      />
    ];
  }

  const keyedChildren = assignReactKeys(kids);


  return keyedChildren.map((child, i) => {
    if (typeof child === 'string') {
      return <React.Fragment key={child.key}>{child}</React.Fragment>;
    }

    if (React.isValidElement(child)) {
      return <React.Fragment key={child.key}>{child}</React.Fragment>;
    }

    switch (child.type) {
      case 'xblock':
        return (
          <React.Fragment key={child.key}>
            {render({ node: child.id, idMap, key: `${child.key}`, nodeInfo, debug })}
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
            name="renderCompiledChildren"
            message={`Unknown child type: "${type}"`}
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
