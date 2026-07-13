// packages/shared/lib/blocks/actions.tsx
//
// Generic block actions - enables blocks to perform behaviors beyond rendering.
//
// - `action()` mixin: makes a block executable with custom logic
// - `input()` mixin: makes a block's value accessible to other blocks
// - `executeNodeActions()`: finds and runs all related actions automatically
//
// The system uses inference to automatically find related blocks (inputs
// for graders, targets for actions) based on DOM hierarchy and explicit
// targeting. Grading — the largest consumer of this machinery — lives in
// lib/grading (the grader() mixin is submitGrade.ts).
//
// NOTE: Actions receive a Redux store from their caller (typically
// ActionButton). This enables replay mode where a different store provides
// historical state.
//
import { z } from 'zod';
import { inferRelatedNodes, getDomNodeByStateKey, propsFromNode } from './olxdom';
import { leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { getBlockByOLXId } from './getBlockByOLXId';
import { inputAttributes } from './attributeSchemas';
import type { RuntimeProps, LoBlock, ValueSelectorFn } from '@/lib/types';

// Mix-in to make a block an action
export function action({ action }) {
  return { action };
}

export function isAction(loBlock) {
  return typeof loBlock?.action === "function";
}

/**
 * Mix-in to make a block an input (provides a value to graders).
 *
 * Value type declarations (valueSchema)
 * ======================================
 * Inputs declare what type they produce via `valueSchema` (a Zod schema).
 * Graders declare what they accept via `inputSchema`. The system checks
 * structural compatibility at parse time and runtime using base-type
 * comparison — refinements like .positive() or .min(5) are ignored since
 * they narrow values without changing the wire type.
 *
 * Examples:
 * - ChoiceInput: valueSchema: z.string()
 * - CheckboxInput: valueSchema: z.array(z.string())
 * - NumberInput: valueSchema: z.number()
 *
 * This enables plug-and-play composition: course authors can pair any
 * compatible input with any compatible grader.
 */
export function input(opts: { selectValue?: ValueSelectorFn; valueSchema?: z.ZodType } = {}) {
  // Everything the helper contributes is packaged as an `inputMixin` layer.
  // createBlock's composition pass merges this layer into the final blueprint,
  // so callers get `isInput`, `slot` attribute, and any `selectValue`/`valueSchema`
  // without declaring them at the top level themselves.
  return {
    inputMixin: {
      ...opts,
      isInput: true as const,
      attributes: inputAttributes,
    },
  };
}
export function isInput(loBlock: LoBlock) {
  return loBlock.isInput;
}

export function isMatch(loBlock) {
  return typeof loBlock?.locals?.match === 'function';
}

/**
 * Find and execute every action related to the caller (explicit target= or
 * DOM inference). Each action receives its own node's full RuntimeProps —
 * stateKey, olxJson, and blueprint are all reachable from props.nodeInfo.
 */
export async function executeNodeActions(props: RuntimeProps) {
  const ids = inferRelatedNodes(props, {
    selector: n => isAction(n.loBlock),
    infer: props.infer,
    targets: props.target
  });
  const map = props.runtime.blockRegistry;
  for (const targetId of ids) {
    const targetDefKey = leafDefinitionKeyFromStateKey(targetId);
    const targetInstance = getBlockByOLXId(props, targetDefKey);
    if (!targetInstance) {
      console.warn(`[executeNodeActions] Action block "${targetId}" not found in Redux`);
      continue;
    }
    const targetBlueprint = map[targetInstance.tag];
    if (!targetBlueprint?.action) {
      console.warn(`[executeNodeActions] Block "${targetId}" (${targetInstance.tag}) has no action method`);
      continue;
    }

    // targetId is already a StateKey from inferRelatedNodes
    const actionNodeInfo = getDomNodeByStateKey(props, targetId);
    if (!actionNodeInfo) {
      throw new Error(`Action ${targetId} not found in dynamic DOM tree - this indicates a bug in the rendering system`);
    }

    await targetBlueprint.action({
      targetId,
      targetInstance,
      targetBlueprint,
      props: propsFromNode(actionNodeInfo),
    });
  }
}
