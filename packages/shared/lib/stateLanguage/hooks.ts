// src/lib/stateLanguage/hooks.ts
//
// React hooks for the state language.
// These bridge the pure evaluation layer with Redux state.

'use client';

import { useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import * as idResolver from '../types/id';
import { selectBlock } from '../state/olxjson';
import type { FieldInfo } from '../types';
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

// ---------------------------------------------------------------------------
// Field materialization cache
// ---------------------------------------------------------------------------
// WeakMap keyed on raw Redux state objects. When a component's state object
// has fields with `read` transforms (e.g., RgaDoc → string), we cache the
// materialized version. Same raw input → same materialized output (referential
// stability for useSelector equality checks). Entries are GC'd when the raw
// state object is replaced (Redux immutability ensures old objects become
// unreachable after state changes).
// ---------------------------------------------------------------------------
const _materializeCache = new WeakMap<object, object>();

/**
 * Materialize a component's raw Redux state using the block's field definitions.
 * Returns the raw state unchanged if no fields have `read` transforms.
 * Caches results for referential stability (same raw input → same output).
 */
function materializeComponentState(
  rawState: any,
  state: any,
  props: any,
  stateKey: string
): any {
  if (!rawState || typeof rawState !== 'object') return rawState;

  // Check cache first
  const cached = _materializeCache.get(rawState);
  if (cached) return cached;

  // Look up block type → field definitions
  const definitionKey = idResolver.stateKeyToDefinitionKey(stateKey as any);
  const sources = props.runtime?.olxJsonSources ?? ['content'];
  const locale = props.runtime?.locale?.code;
  const blockNode = selectBlock(state, sources, definitionKey, locale);
  // Use props.runtime.blockRegistry — no static import of BLOCK_REGISTRY to
  // avoid circular dependency (hooks → blockRegistry → blocks → factory → state → hooks).
  const registry = props.runtime?.blockRegistry;
  if (!registry) return rawState;
  const blockDef = blockNode ? registry[blockNode.tag] : null;

  if (!blockDef?.fields) return rawState;

  // Check if any field has a read transform
  let hasReaders = false;
  for (const [fname, finfo] of Object.entries(blockDef.fields)) {
    const fi = finfo as FieldInfo;
    if (fi.type === 'field' && fi.read && rawState[fname] !== undefined) {
      hasReaders = true;
      break;
    }
  }
  if (!hasReaders) return rawState;

  // Apply reads
  const materialized = { ...rawState };
  for (const [fname, finfo] of Object.entries(blockDef.fields)) {
    const fi = finfo as FieldInfo;
    if (fi.type === 'field' && fi.read && materialized[fname] !== undefined) {
      materialized[fname] = fi.read(materialized[fname]);
    }
  }
  _materializeCache.set(rawState, materialized);
  return materialized;
}

/**
 * Hook that subscribes to all referenced values from Redux.
 *
 * Returns a ContextData object suitable for passing to evaluate().
 * Field values are materialized via field.read (e.g., RgaDoc → string).
 *
 * @param props - Component props (needed for ID resolution)
 * @param refs - Structured references to subscribe to
 * @returns ContextData with resolved and materialized values
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
 * Field values are materialized via field.read when the block's field definition
 * has a read transform (e.g., docField stores RgaDoc, materializes to string).
 * Materialization is cached per raw state object for referential stability.
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
    const stateKey = resolveToReduxKey(props, key);
    const rawState = state?.application_state?.component?.[stateKey];
    // Materialize field values (e.g., RgaDoc → string) using block's field definitions.
    // Returns rawState unchanged if no fields have read transforms.
    // Cached per raw state object for referential stability.
    componentState[key] = materializeComponentState(rawState, state, props, stateKey);
  }

  // Resolve OLX content references (#)
  // Note: These are typically resolved at parse time, not runtime
  // For now, we look in the olxjson store
  for (const { id } of refs.olxContent) {
    const stateKey = resolveToReduxKey(props, id);
    const block = state?.olxjson?.[stateKey];
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
 * TODO: Surface errors to course authors. Currently, parse errors and
 * references to nonexistent component IDs silently fall back, which can
 * leave authors debugging invisible typos. Options:
 * - Return { value, error } so callers can render DisplayError
 * - Accept an onError callback
 * - Validate extracted refs against the store (check that referenced
 *   component IDs actually exist) and warn on unresolved references
 * IntakeGate has a local fix for parse errors; this should generalize.
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
