// packages/shared/lib/state/blockData.ts
//
// Helpers for constructing BlockDataResult — the standard loading/error/ready
// result shape used across useValue, useOlxJson, useBlock, and valueSelector.
//
// These are plain functions (no React, no Redux) so they can be imported from
// both client and server modules.

import { scopePrefixOfStateKey } from '../types/id-grammar';
import type { BlockDataResult, BlockDataStatus, FieldSelector, LoBlock, OlxJson, RuntimeProps, StateKey } from '../types';

/**
 * Construct a BlockDataResult from a status and optional error message.
 */
export function blockData(status: BlockDataStatus, error?: string): BlockDataResult {
  return {
    status,
    loading: status === 'loading',
    ready: status === 'ready',
    error: error ?? null,
  };
}

/**
 * Symbol marking a value selector that returns BlockDataResult & { value }.
 *
 * Most blocks' selectors.value returns a raw value — the system wraps it.
 * Blocks that need to signal loading/error (like Ref) wrap their value selector
 * with `withStatus()` so the system knows to pass the result through as-is.
 */
export const RETURNS_BLOCK_DATA: unique symbol = Symbol('returnsBlockData');

export function withStatus<T extends (...args: any[]) => any>(fn: T): T {
  (fn as any)[RETURNS_BLOCK_DATA] = true;
  return fn;
}

/**
 * Evaluate a blueprint getter declaration in any of its three forms
 * (bare fn / { select, equality } / { deps, compute, equality } — see
 * FieldSelector in types/core.ts). This is the NON-GATED path: with no
 * subscription to optimize, deps + compute simply run together.
 * useFieldSelector splits the pipelined form around its equality gate.
 */
export function evaluateFieldSelector(
  decl: FieldSelector, state: unknown, targetProps: any, stateKey: any
): unknown {
  if (typeof decl === 'function') return decl(state, targetProps, stateKey);
  if (isPipelined(decl)) return decl.compute(...decl.deps(state, targetProps, stateKey));
  return decl.select(state, targetProps, stateKey);
}

/**
 * The three getter forms, discriminated once (see FieldSelector in
 * types/core.ts): a bare fn, `{ select, equality? }`, or the pipelined
 * `{ deps, compute }`. isPipelined selects the deps-subscribed form (compute
 * runs after the gate); declaredEquality is the RESULT equality the
 * `{ select, equality }` form may carry (a bare fn or pipelined form has
 * none). One home for the forms, so useFieldSelector's setup reads as the
 * pipeline law rather than re-spelling `'deps' in decl` inline.
 */
export function isPipelined(decl: FieldSelector): decl is Extract<FieldSelector, { deps: unknown }> {
  return typeof decl === 'object' && 'deps' in decl;
}

export function declaredEquality(decl: FieldSelector): ((a: unknown, b: unknown) => boolean) | undefined {
  return typeof decl === 'object' && 'select' in decl ? decl.equality : undefined;
}

/** True when a getter declaration's underlying fn is withStatus-marked
 *  (returns BlockDataResult & { value } — the caller passes it through). */
export function selectorReturnsBlockData(decl: FieldSelector): boolean {
  const fn = typeof decl === 'function' ? decl : ('select' in decl ? decl.select : undefined);
  return !!fn && !!(fn as any)[RETURNS_BLOCK_DATA];
}

/**
 * Build a block's TARGET props from its static-DOM entry and the ADDRESSED
 * StateKey. Instance scope rides the KEY, not the definition: deriving
 * idPrefix from the key makes a getter's/grader's own-field reads resolve
 * back to the scoped buckets (ns/list:#0:input), never the base definition
 * key. Shared by the DSL materializer and grading preparation; lives in this
 * leaf because those sites sit inside the attributeSchemas import cycle.
 */
export function staticTargetProps(
  runtime: unknown, stateKey: StateKey, defKey: string, entry: OlxJson, loBlock: LoBlock,
): RuntimeProps {
  return {
    ...entry.attributes,
    id: defKey,
    kids: entry.kids ?? [],
    loBlock,
    fields: loBlock.fields ?? {},
    locals: loBlock.locals ?? {},
    runtime,
    nodeInfo: undefined,
    idPrefix: scopePrefixOfStateKey(stateKey),
  } as unknown as RuntimeProps;
}
