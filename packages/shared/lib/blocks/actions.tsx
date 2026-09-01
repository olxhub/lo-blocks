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
import { inferRelatedNodes, getDomNodeByStateKey, propsFromNode } from './dynamicDom';
import { inputAttributes } from './attributeSchemas';
import { ACTION_ERROR, describeError, logErrorEvent } from '@/lib/state/errorEvents';
import type { BlockAction, RuntimeProps, LoBlock } from '@/lib/types';

// Mix-in to make a block an action
export function action({ action }: { action: BlockAction }) {
  return { action };
}

export function isAction(loBlock: LoBlock): boolean {
  return typeof loBlock?.action === 'function';
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
export function input(opts: { valueSchema?: z.ZodType } = {}) {
  // Everything the helper contributes is packaged as an `inputMixin` layer.
  // createBlock's composition pass merges this layer into the final blueprint,
  // so callers get `isInput`, the `slot` attribute, and any `valueSchema`
  // without declaring them at the top level themselves. Computed values are
  // declared via the top-level `selectors: { value }` blueprint axis.
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
 * stateKey, olxJson attributes, and blueprint are all reachable from props
 * (attributes are spread in; the rest via props.nodeInfo / props.loBlock).
 */
export async function executeNodeActions(props: RuntimeProps) {
  const ids = inferRelatedNodes(props, {
    selector: n => isAction(n.loBlock),
    infer: props.infer,
    targets: props.target
  });
  for (const targetId of ids) {
    // targetId is already a StateKey from inferRelatedNodes
    const node = getDomNodeByStateKey(props, targetId);
    if (!node) {
      throw new Error(`Action ${targetId} not found in dynamic DOM tree - this indicates a bug in the rendering system`);
    }
    if (!node.loBlock.action) {
      console.warn(`[executeNodeActions] Block "${targetId}" (${node.olxJson.tag}) has no action method`);
      continue;
    }
    // Callers are event handlers (ActionButton's onClick, Trigger, OnShow)
    // that cannot await us, so a rejection here becomes a dropped promise:
    // the author sees a control that does nothing at all, with no clue which
    // block refused. Name the block and keep going — a failing SetFieldAction
    // must not cancel its siblings on the same button.
    //
    // The console line is for the developer with DevTools open; the EVENT is
    // for everyone else — production log, replay, per-user counts. Both, not
    // either: the stack is only useful on the console, and the console is
    // only visible to one person. See lib/state/errorEvents.ts.
    try {
      await node.loBlock.action({ props: propsFromNode(node) });
    } catch (e) {
      console.error(
        `[executeNodeActions] <${node.olxJson.tag} id="${node.olxJson.id}"> `
        + `(${targetId}) threw; its effect did not happen:`,
        e
      );
      logErrorEvent(ACTION_ERROR, {
        // NOT `id` — see the wire-shape note in errorEvents.ts. A top-level
        // `id` would make the server fold this report into student state.
        actionTag: node.olxJson.tag,
        actionId: node.olxJson.id,
        actionStateKey: targetId,
        // Who ran it: the ActionButton/Trigger/OnShow that could not await.
        // "caller", not "host" — host means a server around here.
        callerTag: props.nodeInfo?.olxJson?.tag,
        callerId: props.nodeInfo?.olxJson?.id,
        callerStateKey: props.nodeInfo?.stateKey,
        ns: props.runtime?.ns,
        error: describeError(e),
      }, props.runtime?.logEvent);
    }
  }
}
