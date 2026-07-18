// packages/shared/lib/state/blockData.ts
//
// Helpers for constructing BlockDataResult — the standard loading/error/ready
// result shape used across useValue, useOlxJson, useBlock, and valueSelector.
//
// These are plain functions (no React, no Redux) so they can be imported from
// both client and server modules.

import type { BlockDataResult, BlockDataStatus, FieldSelector } from '../types';

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
  if ('deps' in decl) return decl.compute(...decl.deps(state, targetProps, stateKey));
  return decl.select(state, targetProps, stateKey);
}

/** True when a getter declaration's underlying fn is withStatus-marked
 *  (returns BlockDataResult & { value } — the caller passes it through). */
export function selectorReturnsBlockData(decl: FieldSelector): boolean {
  const fn = typeof decl === 'function' ? decl : ('select' in decl ? decl.select : undefined);
  return !!fn && !!(fn as any)[RETURNS_BLOCK_DATA];
}
