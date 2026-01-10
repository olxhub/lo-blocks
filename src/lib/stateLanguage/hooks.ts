// src/lib/stateLanguage/hooks.ts
//
// React hooks for the state language.
// These bridge the pure evaluation layer with Redux state.

'use client';

import { useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import * as idResolver from '../blocks/idResolver';
import type { References } from './references';
import type { ContextData } from './evaluate';

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
  }, shallowEqual);

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
