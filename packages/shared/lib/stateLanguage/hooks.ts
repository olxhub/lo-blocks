// src/lib/stateLanguage/hooks.ts
//
// React hooks for the state language.
// These bridge the pure evaluation layer with Redux state.

'use client';

import { useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import * as idResolver from '../blocks/idResolver';
import type { References } from './references';
import { EMPTY_REFS } from './references';
import { parse } from './parser';
import { extractStructuredRefs } from './references';
import { evaluate, createContext } from './evaluate';
import type { ContextData } from './evaluate';

// Two-level shallow equality for ContextData: shallowEqual on each namespace
function contextDataEqual(a: ContextData, b: ContextData): boolean {
  return shallowEqual(a.componentState, b.componentState) &&
         shallowEqual(a.olxContent, b.olxContent) &&
         shallowEqual(a.globalVar, b.globalVar);
}

// Stable empty context for when there are no references
const EMPTY_CONTEXT: ContextData = {
  componentState: {},
  olxContent: {},
  globalVar: {}
};

/**
 * Hook that subscribes to all referenced values from Redux.
 *
 * Returns a ContextData object suitable for passing to evaluate().
 *
 * @param props - Component props (needed for ID resolution)
 * @param refs - Structured references to subscribe to
 * @returns ContextData with resolved values
 */
export function useReferences(props: any, refs: References): ContextData {
  // Build selector that fetches all referenced values
  const contextData = useSelector((state: any) => {
    return selectReferences(state, props, refs);
  }, contextDataEqual);

  return contextData;
}

/**
 * Pure selector that resolves references from Redux state.
 * Can be used outside of React hooks.
 *
 * @param state - Redux state
 * @param props - Component props (needed for ID resolution)
 * @param refs - Structured references to resolve
 * @returns ContextData with resolved values
 */
export function selectReferences(
  state: any,
  props: any,
  refs: References
): ContextData {
  // Fast path: return stable empty context when no refs
  if (
    refs.componentState.length === 0 &&
    refs.olxContent.length === 0 &&
    refs.globalVar.length === 0
  ) {
    return EMPTY_CONTEXT;
  }

  const componentState: Record<string, any> = {};
  const olxContent: Record<string, string> = {};
  const globalVar: Record<string, any> = {};

  // Resolve component state references (@)
  for (const { key } of refs.componentState) {
    // Resolve the key to a Redux key (handles relative vs absolute paths)
    const reduxKey = resolveToReduxKey(props, key);
    const value = state?.application_state?.component?.[reduxKey];
    componentState[key] = value;
  }

  // Resolve OLX content references (#)
  // Note: These are typically resolved at parse time, not runtime
  // For now, we look in the olxjson store
  for (const { id } of refs.olxContent) {
    const reduxKey = resolveToReduxKey(props, id);
    const block = state?.olxjson?.[reduxKey];
    // Extract text content from the block if available
    olxContent[id] = block?.content ?? block?.kids ?? '';
  }

  // Resolve global variable references ($)
  // These come from the system scope
  for (const { name } of refs.globalVar) {
    const value = state?.application_state?.system?.[name];
    globalVar[name] = value;
  }

  return {
    componentState,
    olxContent,
    globalVar
  };
}

/**
 * Resolve a reference ID to a Redux key.
 * Delegates to idResolver.refToReduxKey which handles all reference forms:
 * - "/foo" (absolute) → "foo"
 * - "./foo" (explicit relative) → applies idPrefix
 * - "foo" (bare) → applies idPrefix
 */
function resolveToReduxKey(props: any, id: string): string {
  return idResolver.refToReduxKey({ ...props, id });
}

/**
 * Get resolved references without hooks (for use in actions/effects).
 *
 * @param store - Redux store
 * @param props - Component props
 * @param refs - References to resolve
 * @returns ContextData with resolved values
 */
export function getReferences(
  store: { getState: () => any },
  props: any,
  refs: References
): ContextData {
  return selectReferences(store.getState(), props, refs);
}

/**
 * Evaluate a DSL expression reactively against Redux state.
 *
 * Handles the full parse → extract refs → subscribe → evaluate pipeline.
 * Hook count is stable regardless of whether expression is provided,
 * so it's safe to call unconditionally.
 *
 * @param props - Component props (needed for ID resolution)
 * @param expression - DSL expression string, or undefined to skip
 * @param fallback - Value to return when expression is undefined or on error
 * @returns The evaluated result, or fallback
 */
export function useDSLExpression(props: any, expression: string | undefined, fallback: any = null): any {
  const { ast, refs } = useMemo(() => {
    if (!expression) return { ast: null, refs: EMPTY_REFS };
    try {
      return { ast: parse(expression), refs: extractStructuredRefs(expression) };
    } catch (e) {
      console.warn('[useDSLExpression] Failed to parse:', expression, e);
      return { ast: null, refs: EMPTY_REFS };
    }
  }, [expression]);

  const resolved = useReferences(props, refs);

  return useMemo(() => {
    if (!ast) return fallback;
    try {
      return evaluate(ast, createContext(resolved));
    } catch (e) {
      console.warn('[useDSLExpression] Failed to evaluate:', expression, e);
      return fallback;
    }
  }, [ast, resolved, expression, fallback]);
}
