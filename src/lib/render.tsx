// src/lib/render.tsx
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
// SYNCHRONOUS RENDERING: All render functions are synchronous. If a block is not
// found in idMap, an error is displayed (no async fetching). Content must be
// loaded into idMap before rendering.
//
import htmlTags from 'html-tags';
import React from 'react';
import { DisplayError, DebugWrapper } from '@/lib/util/debug';
import { COMPONENT_MAP } from '@/components/componentMap';
import type { OlxKey } from '@/lib/types';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { getGrader } from '@/lib/blocks/olxdom';
import { assignReactKeys, refToOlxKey } from '@/lib/blocks/idResolver';

// Root sentinel has minimal loBlock so selectors don't need ?. checks
// TODO: Give root a real loBlock created via blocks.core() for consistency
const ROOT_LOBLOCK = Object.freeze({ name: 'Root', isGrader: false, isInput: false });
export const makeRootNode = () => ({ sentinel: 'root', renderedKids: {}, loBlock: ROOT_LOBLOCK });

/**
 * Main render function - synchronously renders a node to React elements.
 *
 * Node types accepted:
 *   - { type: 'block', id, overrides? } - reference to block in idMap
 *   - { tag, id, attributes, kids } - inline OLX node
 *   - Array of kids - rendered via renderCompiledKids
 *
 * @returns React element(s) or null
 */
export function render({ node, idMap, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '', olxJsonSources }: {
  node: any;
  idMap: any;
  nodeInfo: any;
  componentMap?: any;
  idPrefix?: string;
  olxJsonSources?: string[];
}): React.ReactNode {
  if (!node) return null;

  // JSX should not be passed to render() - the OLX pipeline produces structured nodes
  if (React.isValidElement(node)) {
    throw new Error('render(): JSX element passed directly. Use structured nodes from OLX parser.');
  }

  // Handle list of kids
  if (Array.isArray(node)) {
    return renderCompiledKids({ kids: node, idMap, nodeInfo, componentMap, idPrefix, olxJsonSources });
  }

  // Handle { type: 'block', id, overrides }
  if (
    typeof node === 'object' &&
    node !== null &&
    node.type === 'block' &&
    typeof node.id === 'string'
  ) {
    // Synchronous lookup in idMap - no async fetching
    const olxKey = refToOlxKey(node.id);
    const entry = idMap?.[olxKey];
    if (!entry) {
      return (
        <DisplayError
          id={`missing-id-${node.id}`}
          name="render"
          message={`Block "${node.id}" not found in content`}
          data={{ nodeId: node.id, olxKey }}
        />
      );
    }
    const entryWithOverrides = node.overrides
      ? { ...entry, attributes: { ...entry.attributes, ...node.overrides } }
      : entry;
    return render({ node: entryWithOverrides, idMap, nodeInfo, componentMap, idPrefix, olxJsonSources });
  }

  // Handle structured OLX-style node
  const { tag, attributes = {}, kids = [] } = node;

  if (!componentMap[tag] || !componentMap[tag].component) {
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
    childNodeInfo = { node, renderedKids: {}, parent: nodeInfo, loBlock: blockType };
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
  // very nice for debugging and introspection.

  // TODO: Should the wrapper be a <div> or a <span>?
  return (
    <DebugWrapper props={wrapperProps} loBlock={blockType}>
      <div className={combinedClassName} data-block-type={tag}>
        <Component
          {...attributes}
          id={node.id}
          kids={kids}
          idMap={idMap}
          loBlock={blockType}
          locals={blockType.locals}
          fields={blockType.fields}
          nodeInfo={childNodeInfo}
          componentMap={componentMap}
          idPrefix={idPrefix}
          olxJsonSources={olxJsonSources}
          {...(graderId && { graderId })}
        />
      </div>
    </DebugWrapper>
  );
}

/**
 * Render kids array that may include: text, block references, HTML, etc.
 * Synchronous - all content must already be in idMap.
 *
 * @returns Array of React elements
 */
export function renderCompiledKids(props): React.ReactNode[] {
  let { kids, children, idMap, nodeInfo, componentMap = COMPONENT_MAP, idPrefix = '', olxJsonSources } = props;
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

  // Process all children synchronously
  return keyedKids.map((child, i) => {
    if (typeof child === 'string') {
      return <React.Fragment key={`string-${i}`}>{child}</React.Fragment>;
    }

    // JSX should not appear in kids array - parser produces structured nodes
    if (React.isValidElement(child)) {
      throw new Error('renderCompiledKids: JSX element in kids array. Use structured nodes from OLX parser.');
    }

    // Handle different child types
    // Note: Inline OLX nodes have {tag, id, attributes} but no type property
    // Block references have {type: 'block', id}

    if (child.type === 'block') {
      return (
        <React.Fragment key={child.key}>
          {render({ node: child, idMap, nodeInfo, componentMap, idPrefix, olxJsonSources })}
        </React.Fragment>
      );
    }

    if (child.type === 'text') {
      return <span key={child.key}>{child.text}</span>;
    }

    if (child.type === 'html') {
      // React fails -- spectacularly -- on invalid HTML tags.
      if (!htmlTags.includes(child.tag)) {
        return <p key={child.key}>Invalid tag: {child.tag}</p>;
      }
      return React.createElement(
        child.tag,
        { key: child.key, ...child.attributes },
        renderCompiledKids({ kids: child.kids ?? [], idMap, nodeInfo, componentMap, idPrefix, olxJsonSources })
      );
    }

    // Inline OLX node - has tag property but no type
    // This happens when components pass full block entries as kids (e.g., Navigator's TemplateContent)
    if (child.tag && typeof child.tag === 'string') {
      return (
        <React.Fragment key={child.key}>
          {render({ node: child, idMap, nodeInfo, componentMap, idPrefix, olxJsonSources })}
        </React.Fragment>
      );
    }

    // Unknown child type
    return (
      <DisplayError
        key={child.key}
        name="renderCompiledKids"
        message={`Unknown child type: "${child.type}"`}
        data={child}
      />
    );
  });
}

// =============================================================================
// HOOKS - Re-exported from useRenderedBlock.ts
// =============================================================================
//
// The actual hook implementations live in src/lib/blocks/useRenderedBlock.ts
// They are re-exported here for backward compatibility with existing imports.
//
// Hooks:
// - useBlock(props, id) - Render a single block with loading/error handling
// - useKids(props) - Render children from props.kids
// - useKidsWithState(props) - Like useKids but exposes ready/error state
//
export { useBlock, useKids, useKidsWithState } from '@/lib/blocks/useRenderedBlock.tsx';

/**
 * Helper to render a virtual block without exposing OLX node shape.
 * Used for programmatically creating blocks (e.g., CapaProblem status icons).
 *
 * @param {object} props - Component props (must include idMap, nodeInfo, componentMap)
 * @param {string} tag - The component tag (e.g., 'Correctness')
 * @param {object} options - { id, ...attributes }
 * @param {Array} kids - Child nodes
 * @returns Rendered React element
 *
 * @example
 * renderBlock(props, 'Correctness', { id: 'x_status', target: '...' })
 */
export function renderBlock(props, tag, options: { id?: string; [key: string]: any } = {}, kids = []): React.ReactNode {
  const { id, ...attributes } = options;
  const node = { id, tag, attributes, kids };
  return render({ ...props, node });
}
