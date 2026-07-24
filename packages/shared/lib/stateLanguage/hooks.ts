// packages/shared/lib/stateLanguage/hooks.ts
//
// React hooks for the state language.
// These bridge the pure evaluation layer with Redux state.

'use client';

import { useEffect, useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { scopedStateKeyForBlock, leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { selectBlock } from '../state/olxjson';
// blockData is a leaf module — importing state/redux here would close the
// module cycle attributeSchemas → stateLanguage → hooks → redux → ... .
import { evaluateFieldSelector, selectorReturnsBlockData, staticTargetProps } from '../state/blockData';
import { asObservableValue } from '../types/fieldValues';
import type { FieldInfo, FieldSelector, StateKey } from '../types';
import type { References } from './references';
import { EMPTY_REFS } from './references';
import { parse } from './parser';
import { extractStructuredRefs } from './references';
import { evaluate, createContext } from './evaluate';
import type { ContextData } from './evaluate';

// Two-level shallow equality for ContextData: shallowEqual on each namespace,
// plus the content namespace itself — ns feeds the id() helper, so a context
// that differs only by ns must still be treated as changed (otherwise id()
// would qualify against a stale namespace). Equal in the common stable-ns case,
// so this doesn't churn subscribers.
function contextDataEqual(a: ContextData, b: ContextData): boolean {
  return a.ns === b.ns &&
         shallowEqual(a.componentState, b.componentState) &&
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
// ---------------------------------------------------------------------------
// Bucket materialization
// ---------------------------------------------------------------------------
// The view a DSL reference sees is the block's OBSERVABLE state: stored
// values decoded through field.read (e.g. RgaDoc → string), overlaid with
// the block's computed fields (LoBlock.selectors — the getter half of the
// getter/setter pattern; grading state is the canonical case). Generic:
// this module knows nothing about grading — capabilities arrive as data on
// the blueprint via props.runtime. Cached per Redux state object for
// referential stability (selectors may depend on more than the one bucket).
const _bucketViewCache = new WeakMap<object, Map<string, object>>();

function materializeComponentState(
  rawState: any,
  state: any,
  props: any,
  stateKey: StateKey
): any {
  const definitionKey = leafDefinitionKeyFromStateKey(stateKey);
  const sources = props.runtime.olxJsonSources ?? ['content'];
  const locale = props.runtime.locale.code;
  const blockNode = selectBlock(state, sources, definitionKey, locale);
  // props.runtime.blockRegistry, not a static BLOCK_REGISTRY import — avoids
  // the circular dependency hooks → blockRegistry → blocks → factory → state.
  const blockDef = blockNode ? props.runtime.blockRegistry[blockNode.tag] : null;
  if (!blockDef) return rawState;
  const selectors = blockDef.selectors;
  if (!selectors && (!rawState || typeof rawState !== 'object')) return rawState;

  let byKey = _bucketViewCache.get(state);
  if (!byKey) { byKey = new Map(); _bucketViewCache.set(state, byKey); }
  const cached = byKey.get(stateKey);
  if (cached) return cached;

  // Stored values, decoded via field.read where declared. The materializer is
  // a level-3 read (getters overlaid below), so decoded values are stamped
  // ObservableValue on the way into the view (types/fieldValues.ts doctrine).
  const view = { ...(rawState && typeof rawState === 'object' ? rawState : {}) };
  for (const [fname, finfo] of Object.entries(blockDef.fields ?? {})) {
    const fi = finfo as FieldInfo;
    if (fi.type === 'field' && fi.read && view[fname] !== undefined) {
      view[fname] = asObservableValue(fi.read(view[fname]));
    }
  }

  // Computed fields overlaid — target props from the static DOM (the DSL
  // never touches the dynamic DOM). staticTargetProps derives idPrefix from
  // the ADDRESSED key, so getters' own-field reads resolve to the scoped
  // instance buckets, never the base definition key.
  if (selectors) {
    const targetProps = staticTargetProps(props.runtime, stateKey, definitionKey, blockNode!, blockDef);
    for (const [name, decl] of Object.entries(selectors) as [string, FieldSelector][]) {
      // All three declaration forms evaluate here (no gate to optimize).
      const raw = evaluateFieldSelector(decl, state, targetProps as any, stateKey);
      // withStatus selectors return BlockDataResult — the DSL wants the value.
      // Getter authors return plain values; the overlay stamps them final.
      view[name] = asObservableValue(selectorReturnsBlockData(decl) ? (raw as any)?.value : raw);
    }
  }

  byKey.set(stateKey, view);
  return view;
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

  // Referencing a block's state implies needing the block: trigger content
  // loads for referenced blocks that aren't in Redux yet (same contract as
  // useValue's target= path — ensureBlock dedups and no-ops when known, and
  // its content fetch carries the block's field state). Without this,
  // when="@problem.correct" against an unserved block silently evaluates
  // over an absent bucket.
  const refKeys = refs.componentState.map(r => r.key).join(',');
  useEffect(() => {
    if (props.runtime.sideEffectFree) return;
    const source = props.runtime.olxJsonSources?.[0] ?? 'content';
    // Dynamic import: a static one closes the module cycle
    // useOlxJson → attributeSchemas → stateLanguage → hooks and breaks init.
    import('../player/client/useOlxJson').then(({ ensureBlock }) => {
      for (const { key } of refs.componentState) {
        try {
          const stateKey = resolveToStateKey(props, key);
          ensureBlock(props, leafDefinitionKeyFromStateKey(stateKey), source);
        } catch { /* unresolvable ref — evaluate() will fall back as before */ }
      }
    });
    // ensureBlock deduplicates; props omitted for the same reason as useValue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKeys]);

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
  // The host block's namespace rides along for the id() helper.
  // runtime.ns is guaranteed on every render path — no fallback.
  const ns = props.runtime.ns;

  // Fast path when no refs. ns still rides along — `id('foo') in ['a','b']`
  // references no state but needs the namespace. contextDataEqual compares the
  // three reference namespaces plus ns; with a stable ns the fresh wrapper
  // object doesn't churn useReferences subscribers.
  if (
    refs.componentState.length === 0 &&
    refs.olxContent.length === 0 &&
    refs.globalVar.length === 0
  ) {
    return { ...EMPTY_CONTEXT, ns };
  }

  const componentState: Record<string, any> = {};
  const olxContent: Record<string, string> = {};
  const globalVar: Record<string, any> = {};

  // Resolve component state references (@)
  for (const { key } of refs.componentState) {
    // Resolve the key to a Redux key (handles relative vs absolute paths)
    const stateKey = resolveToStateKey(props, key);
    const rawState = state?.application_state?.component?.[stateKey];
    // The block's observable state: stored values decoded via field.read,
    // computed fields (blueprint selectors) overlaid. Cached per state
    // object for referential stability.
    componentState[key] = materializeComponentState(rawState, state, props, stateKey);
  }

  // Resolve OLX content references (#)
  // Note: These are typically resolved at parse time, not runtime
  // For now, we look in the olxjson store
  for (const { id } of refs.olxContent) {
    const stateKey = resolveToStateKey(props, id);
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
    globalVar,
    ns,
  };
}

/**
 * Resolve a DSL reference ID to a StateKey.
 *
 * Current behavior is intentionally lexical: `@answer.value` inside a scoped
 * renderer (DynamicList, UseDynamic, etc.) resolves through the caller's
 * idPrefix, so each repeated instance watches its own local `answer`.
 *
 * TODO(namespace/dsl): This resolver only models that lexical form. The
 * expression grammar also accepts quoted IDs, and generated expressions may
 * eventually contain already-scoped StateRefs such as
 * `@"CONTENT/list:#0:answer".value`. Those must NOT go through
 * scopedStateKeyForBlock(), because they already contain their runtime scope.
 * When we take on scoped StateRef support in the DSL, split this resolver into
 * two explicit paths:
 *
 *   - lexical DefinitionRef-like refs: apply caller idPrefix
 *   - explicit StateRef/StateKey refs: validate/qualify without adding scope
 *
 * Do not "fix" this by making all DSL refs global; that would break the useful
 * local semantics of bare `@answer` inside repeated/scoped content.
 */
function resolveToStateKey(props: any, id: string): StateKey {
  return scopedStateKeyForBlock({ ...props, id });
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
