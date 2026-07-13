// packages/shared/lib/stateLanguage/hooks.ts
//
// React hooks for the state language.
// These bridge the pure evaluation layer with Redux state.

'use client';

import { useEffect, useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { scopedStateKeyForBlock, leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { selectBlock } from '../state/olxjson';
import type { FieldInfo, StateKey } from '../types';
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

// ---------------------------------------------------------------------------
// Grader state resolver (injected)
// ---------------------------------------------------------------------------
// Grading state for grader blocks is DERIVED, not stored (metagraders like
// CapaProblem never write correct/message/score; immediate-mode leaf graders
// derive from live input values — see lib/grading/useCorrectness.ts). DSL
// expressions like when="@problem.correct === correctness.correct" must see
// that derived state, so grader references resolve through this hook.
// Injected by lib/grading at import time rather than imported statically:
// olxdom → stateLanguage → grading → olxdom would be a module cycle.
type GraderStateResolver = (state: any, props: any, stateKey: StateKey) => Record<string, any>;
let _graderStateResolver: GraderStateResolver | null = null;
export function registerGraderStateResolver(fn: GraderStateResolver) {
  _graderStateResolver = fn;
}

// Merged bucket cache (same referential-stability contract as
// _materializeCache, but keyed per Redux state object since the grading
// overlay depends on more than the one bucket).
const _graderOverlayCache = new WeakMap<object, Map<string, object>>();

/** Overlay derived grading state onto a grader block's bucket. */
function withDerivedGrading(
  state: any,
  props: any,
  stateKey: StateKey,
  bucket: any,
): any {
  if (!_graderStateResolver) return bucket;
  const definitionKey = leafDefinitionKeyFromStateKey(stateKey);
  const sources = props.runtime?.olxJsonSources ?? ['content'];
  const locale = props.runtime?.locale?.code;
  const blockNode = selectBlock(state, sources, definitionKey, locale);
  const blockDef = blockNode ? props.runtime?.blockRegistry?.[blockNode.tag] : null;
  if (!blockDef?.isGrader) return bucket;

  let byKey = _graderOverlayCache.get(state);
  if (!byKey) { byKey = new Map(); _graderOverlayCache.set(state, byKey); }
  const cached = byKey.get(stateKey);
  if (cached) return cached;
  const merged = { ...bucket, ..._graderStateResolver(state, props, stateKey) };
  byKey.set(stateKey, merged);
  return merged;
}

/**
 * Materialize a component's raw Redux state using the block's field definitions.
 * Returns the raw state unchanged if no fields have `read` transforms.
 * Caches results for referential stability (same raw input → same output).
 */
function materializeComponentState(
  rawState: any,
  state: any,
  props: any,
  stateKey: StateKey
): any {
  if (!rawState || typeof rawState !== 'object') return rawState;

  // Check cache first
  const cached = _materializeCache.get(rawState);
  if (cached) return cached;

  // Look up block type → field definitions
  const definitionKey = leafDefinitionKeyFromStateKey(stateKey);
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

  // Referencing a block's state implies needing the block: trigger content
  // loads for referenced blocks that aren't in Redux yet (same contract as
  // useValue's target= path — ensureBlock dedups and no-ops when known, and
  // its content fetch carries the block's field state). Without this,
  // when="@problem.correct" against an unserved block silently evaluates
  // over an absent bucket.
  const refKeys = refs.componentState.map(r => r.key).join(',');
  useEffect(() => {
    if (props.runtime?.sideEffectFree) return;
    const source = props.runtime?.olxJsonSources?.[0] ?? 'content';
    // Dynamic import: a static one closes the module cycle
    // useOlxJson → attributeSchemas → stateLanguage → hooks and breaks init.
    import('../blocks/useOlxJson').then(({ ensureBlock }) => {
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
    // Materialize field values (e.g., RgaDoc → string) using block's field definitions.
    // Returns rawState unchanged if no fields have read transforms.
    // Cached per raw state object for referential stability.
    // Grader blocks additionally get derived grading state overlaid
    // (correct/message/score/submitCount are computed, not stored).
    componentState[key] = withDerivedGrading(
      state, props, stateKey,
      materializeComponentState(rawState, state, props, stateKey),
    );
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
