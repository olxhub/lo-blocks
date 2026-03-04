// src/lib/state/blockData.ts
//
// Helpers for constructing BlockDataResult — the standard loading/error/ready
// result shape used across useValue, useOlxJson, useBlock, and valueSelector.
//
// These are plain functions (no React, no Redux) so they can be imported from
// both client and server modules.

import type { BlockDataResult, BlockDataStatus } from '../types';

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
 * Symbol marking a selectValue function that returns BlockDataResult & { value }.
 *
 * Most blocks' selectValue returns a raw value — the system wraps it.
 * Blocks that need to signal loading/error (like Ref) wrap their selectValue
 * with `withStatus()` so the system knows to pass the result through as-is.
 */
export const RETURNS_BLOCK_DATA: unique symbol = Symbol('returnsBlockData');

export function withStatus<T extends (...args: any[]) => any>(fn: T): T {
  (fn as any)[RETURNS_BLOCK_DATA] = true;
  return fn;
}
