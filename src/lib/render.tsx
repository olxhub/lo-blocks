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
// SYNCHRONOUS RENDERING: All render functions are synchronous.
//
import htmlTags from 'html-tags';
import React from 'react';
import { DisplayError, DebugWrapper } from '@/lib/util/debug';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import type { OlxKey, LoBlockRuntimeContext } from '@/lib/types';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { getGrader, getEventContext } from '@/lib/blocks/olxdom';
import { assignReactKeys, refToOlxKey } from '@/lib/blocks/idResolver';
import { selectBlock } from '@/lib/state/olxjson';
import type { Store } from 'redux';

// Root sentinel has minimal loBlock so selectors don't need ?. checks
// TODO: Give root a real loBlock created via blocks.core() for consistency
const ROOT_LOBLOCK = Object.freeze({ name: 'Root', isGrader: false, isInput: false });

/**
 * Create a root nodeInfo for rendering.
 * @param contextId - Optional ID for event context (e.g., "preview", "studio", "debug")
 */
export const makeRootNode = (contextId?: string) => ({
  sentinel: 'root',
  id: contextId,
  renderedKids: {},
  loBlock: ROOT_LOBLOCK
});

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
// Type for logEvent function - matches lo_event.logEvent signature
export type LogEventFn = (event: string, payload: Record<string, any>) => void;

export function render({ node, nodeInfo, runtime }: {
  node: any;
  nodeInfo: any;
  runtime: LoBlockRuntimeContext;
}): React.ReactNode {
  if (!runtime) {
    throw new Error(
      'render() requires runtime context. ' +
      'This indicates incomplete prop threading - ' +
      'all components should receive and pass through the runtime bundle.'
    );
  }

  const {
    blockRegistry: actualBlockRegistry = runtime.blockRegistry,
    idPrefix: actualIdPrefix = runtime.idPrefix ?? '',
    olxJsonSources: actualOlxJsonSources = runtime.olxJsonSources,
    store: actualStore = runtime.store,
    logEvent: actualLogEvent = runtime.logEvent,
    sideEffectFree: actualSideEffectFree = runtime.sideEffectFree,
  } = runtime;
  if (!node) return null;

  // JSX should not be passed to render() - the OLX pipeline produces structured nodes
  if (React.isValidElement(node)) {
    throw new Error('render(): JSX element passed directly. Use structured nodes from OLX parser.');
  }

  // Handle list of kids
  if (Array.isArray(node)) {
    return renderCompiledKids({ kids: node, nodeInfo, runtime });
  }

  // Handle { type: 'block', id, overrides }
  if (
    typeof node === 'object' &&
    node !== null &&
    node.type === 'block' &&
    typeof node.id === 'string'
  ) {
    // Synchronous lookup in Redux store
    if (!actualStore) {
      return (
        <DisplayError
          id={`missing-store-${node.id}`}
          name="render"
          message="Redux store not available"
          technical={{ blockId: node.id, hint: 'Store is missing from runtime context' }}
        />
      );
    }
    const olxKey = refToOlxKey(node.id);
    const sources = actualOlxJsonSources ?? ['content'];
    const entry = selectBlock(actualStore.getState(), sources, olxKey);
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
    return render({ node: entryWithOverrides, nodeInfo, runtime });
  }

  // Handle structured OLX-style node
  const { tag, attributes = {}, kids = [] } = node;

  if (!actualBlockRegistry[tag] || !actualBlockRegistry[tag].component) {
    return (
      <DisplayError
        id={`unknown-tag-${tag}`}
        name="render"
        message={`No component found for tag "${tag}"`}
        data={node}
      />
    );
  }

  const blockType = actualBlockRegistry[tag];
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

  // Semantic validation beyond what Zod can express (e.g., valid number, valid regex)
  if (blockType.validateAttributes) {
    const semanticErrors = blockType.validateAttributes(validationResult.data);
    if (semanticErrors && semanticErrors.length > 0) {
      return (
        <DisplayError
          id={`semantic-validation-${node.id}`}
          name={tag}
          message={`Invalid attributes:\n${semanticErrors.join('\n')}`}
          technical={{ attributes: validationResult.data, semanticErrors }}
        />
      );
    }
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
    blockRegistry: actualBlockRegistry,
    idPrefix: actualIdPrefix
  };

  // Check requiresGrader - inject graderId or show error
  let graderId: OlxKey | null = null;
  if (blockType.requiresGrader) {
    try {
      graderId = getGrader({ ...wrapperProps });
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

  // Wrap logEvent to include context from OLX DOM hierarchy
  // Don't overwrite if context already set by a deeper child
  const contextualLogEvent: LogEventFn = actualLogEvent
    ? (event, payload) => {
        if (payload?.context) {
          // Child already set context - pass through unchanged
          actualLogEvent(event, payload);
        } else {
          const context = getEventContext(childNodeInfo);
          actualLogEvent(event, { ...payload, ...(context && { context }) });
        }
      }
    : (() => {}) as LogEventFn;  // No-op if logEvent not provided

  // Update runtime with contextual logEvent
  const finalRuntime: LoBlockRuntimeContext = {
    ...runtime,
    logEvent: contextualLogEvent,
    idPrefix: actualIdPrefix as any,
  };

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
          loBlock={blockType}
          locals={blockType.locals}
          fields={blockType.fields}
          nodeInfo={childNodeInfo}
          runtime={finalRuntime}
          {...(graderId && { graderId })}
        />
      </div>
    </DebugWrapper>
  );
}

/**
 * Render kids array that may include: text, block references, HTML, etc.
 *
 * @returns Array of React elements
 */
export function renderCompiledKids(props): React.ReactNode[] {
  let { kids, children, nodeInfo, runtime } = props;

  if (!runtime) {
    throw new Error(
      'renderCompiledKids() requires runtime context in props. ' +
      'This indicates broken prop threading - render() should pass runtime to all components.'
    );
  }

  const { blockRegistry = BLOCK_REGISTRY, idPrefix = '', olxJsonSources, store, logEvent, sideEffectFree } = runtime;

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
          {render({ node: child, nodeInfo, runtime })}
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
        renderCompiledKids({ kids: child.kids ?? [], nodeInfo, runtime })
      );
    }

    // Inline OLX node - has tag property but no type
    // This happens when components pass full block entries as kids (e.g., Navigator's TemplateContent)
    if (child.tag && typeof child.tag === 'string') {
      return (
        <React.Fragment key={child.key}>
          {render({ node: child, nodeInfo, runtime })}
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
export { useBlock, useKids, useKidsWithState } from '@/lib/blocks/useRenderedBlock';

/**
 * Render an OlxJson node directly (no idMap lookup needed).
 *
 * Use this when you have the OlxJson object already (e.g., from useOlxJson hook).
 * This is the preferred method for components that use hooks to access content.
 *
 * @param props - Render props (nodeInfo, blockRegistry, idPrefix, etc.)
 * @param props.node - The OlxJson to render
 */
export function renderOlxJson(props: {
  node: any;
  nodeInfo: any;
  runtime: LoBlockRuntimeContext;
}): React.ReactNode {
  const { node, nodeInfo, runtime } = props;

  if (!runtime) {
    throw new Error(
      'renderOlxJson() requires runtime context. ' +
      'This indicates incomplete prop threading.'
    );
  }

  return render({
    node,
    nodeInfo,
    runtime
  });
}

/**
 * Helper to render a virtual block without exposing OLX node shape.
 * Used for programmatically creating blocks (e.g., CapaProblem status icons).
 *
 * @param {object} props - Component props (must include nodeInfo, runtime)
 * @param {string} tag - The component tag (e.g., 'Correctness')
 * @param {object} options - { id, ...attributes }
 * @param {Array} kids - Child nodes
 * @returns Rendered React element
 *
 * @example
 * renderBlock(props, 'Correctness', { id: 'x_status', target: '...' })
 */
export function renderBlock(props, tag, options: { id?: string;[key: string]: any } = {}, kids = []): React.ReactNode {
  if (!props.runtime) {
    throw new Error(
      'renderBlock() requires runtime context in props. ' +
      'This indicates incomplete prop threading.'
    );
  }
  const { id, ...attributes } = options;
  const node = { id, tag, attributes, kids };
  return render({
    node,
    nodeInfo: props.nodeInfo,
    runtime: props.runtime
  });
}
