// packages/shared/lib/state/fieldHooks.ts
//
// The React ('use client') surface of the state layer: the hooks that wrap
// fieldReads/fieldWrites/blockValues with subscription + re-render. The pure
// modules carry the semantics; these add the useSelector equality gate and
// effect wiring. Headless callers must import the pure modules, never this one.

'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useStore, shallowEqual } from 'react-redux';

import { scopedStateKeyForBlock, leafDefinitionKeyFromStateKey, stateKeyForGlobalRef, parseAnyStateRef } from '../types/id-grammar';
import { scopes } from '../state/scopes';
import { FieldInfo, FieldSelector, StateRef, StateKey, RuntimeProps, BaselineProps, BlockDataResult, CurrentUser } from '../types';
import { asObservableValue } from '../types/fieldValues';
import type { RawFieldValue, ObservableValue } from '../types/fieldValues';
import { assertValidField } from './fields';
import { getUrlOverride, setUrlValue } from './urlFields';
import { ensureBlock } from '../blocks/ensure';
import { isPipelined, declaredEquality } from './blockData';
import {
  rawFieldSelector, fieldSelector, resolveDecl, evalGetter, withGetterGuard, type SelectorOptions,
} from './fieldReads';
import { updateField } from './fieldWrites';
import { valueSelector } from './blockValues';

/**
 * React hook wrapper around fieldSelector with automatic re-rendering.
 *
 * INVARIANT: field.read (decode) is applied AFTER the useSelector equality gate,
 * never inside it. useSelector compares raw Redux values; materialization happens
 * after. This prevents unnecessary re-renders: decode() may produce new objects
 * each call (e.g., new Set from an OR-Set CRDT), but the raw value is
 * reference-stable between dispatches.
 *
 * Critical for field types whose decode() produces new objects on every call
 * (e.g., setField decoding a SetDoc to a new Set). The raw value is
 * reference-stable between dispatches; decode runs only when raw changes.
 */
export const useFieldSelector = <T>(
  props: any,               // TODO: narrow when convenient
  field: FieldInfo,
  options: SelectorOptions<T> = {}
): ObservableValue<T> => {
  // The hook implements level 3: getter-backed fields subscribe the getter
  // (own and cross alike — same semantics as fieldSelector); stored fields
  // subscribe level 1 (raw) for the equality gate and decode AFTER it.
  // decode() may mint a new object each call (a Set from an OR-Set CRDT); the
  // raw value is reference-stable between dispatches, so gating on it is what
  // keeps re-renders — and input cursors — stable. Do NOT "simplify" this to
  // wrap fieldSelector, which decodes before returning and would defeat the
  // gate.
  //
  // The getter DECLARATION (and hence its form) is static per blueprint; only
  // content-load timing is state-dependent, so it is resolved here at render.
  // The subscription re-resolves per dispatch; content only ever gets ADDED,
  // so a render always sees the same-or-older state than its subscription —
  // a load transition changes the subscribed value, re-renders, and this
  // resolution self-heals on the next render.
  const store = useStore();
  const renderDecl: FieldSelector | null = field.scope === scopes.component
    ? (resolveDecl(store.getState(), props, options.stateKey, field.name, 'selectors')?.decl ?? null)
    : null;
  const pipelined = !!renderDecl && isPipelined(renderDecl);
  // Read pipeline law: subscribe cheap → gate on equality → interpret after.
  // Pipelined getters gate on their deps ARRAY (shallow-compared);
  // { select, equality } gates on the declared RESULT equality; bare fns and
  // stored reads gate on field.equality ?? the caller's override.
  const equality = pipelined
    ? shallowEqual
    : ((renderDecl ? declaredEquality(renderDecl) : undefined) ?? field.equality ?? options.equalityFn);
  const gated = useSelector(
    (state) => {
      // Blueprint getters are honored for own AND cross reads — the hook must
      // agree with fieldSelector (one meaning per level). Getterless fields
      // subscribe raw storage so the gate compares the reference-stable
      // representation; decode runs after, below.
      if (field.scope === scopes.component) {
        const resolved = resolveDecl(state, props, options.stateKey, field.name, 'selectors');
        if (resolved) {
          const { decl } = resolved;
          if (isPipelined(decl)) {
            // Pipelined form: subscribe the deps array only. deps take state,
            // so the re-entrancy guard wraps them like any getter body.
            return withGetterGuard(resolved.stateKey, field.name, () =>
              decl.deps(state, resolved.targetProps, resolved.stateKey));
          }
          return evalGetter(state, resolved, field.name, options.fallback);
        }
      }
      return rawFieldSelector(state, props, field, options);
    },
    equality
  );
  // Interpret after the gate. Pipelined getters compute from the gated deps —
  // useSelector returns the PREVIOUS array while the gate holds, so the memo
  // re-runs compute only when deps really changed. Getter results are final
  // (never re-decoded); stored reads decode via field.read. This return is the
  // hook's single ObservableValue stamp point (types/fieldValues.ts doctrine).
  const fallback = options.fallback;
  const value = useMemo(() => {
    if (pipelined && Array.isArray(gated)) {
      const computed = (renderDecl as { compute: (...deps: any[]) => unknown }).compute(...gated);
      return computed === undefined ? fallback : computed;
    }
    if (renderDecl) return gated;
    return field.read ? field.read(gated as RawFieldValue<any>) : gated;
  }, [gated, renderDecl, pipelined, field, fallback]);
  return asObservableValue(value) as ObservableValue<T>;
};

/**
 * Hook to access the current user identity from Redux.
 * Returns null until the server's auth echo has landed.
 *
 * We might consider a dummy name until auth. Dunno. We're
 * still figuring this out.
 */
export function useUser(): CurrentUser | null {
  return useSelector(
    (state: any) => state?.application_state?.system?.currentUser ?? null
  );
}

export function useFieldState(
  props: BaselineProps | null,
  field: FieldInfo,
  fallback?,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {}
) {
  assertValidField(field);

  // URL field sync: check URL search params for an override of the fallback.
  // Only applies to fields with url:true — other fields skip this entirely.
  const propsId = (props as any)?.id;
  const urlOverride = field.url ? getUrlOverride(propsId, field) : undefined;
  const effectiveFallback = urlOverride !== undefined ? urlOverride : fallback;

  const value = useFieldSelector(props, field, { fallback: effectiveFallback, stateKey, tag });

  const ref = useRef({ props, field, stateKey, tag, fallback });
  ref.current = { props, field, stateKey, tag, fallback };
  const setValue = useCallback(
    (newValue: any) => {
      const { props, field, stateKey, tag } = ref.current;
      updateField(props, field, newValue, { stateKey, tag });
      // Sync to URL for url-enabled fields
      if (field.url) {
        setUrlValue((props as any)?.id, field, newValue);
      }
    },
    []
  );

  // Browser back/forward: re-sync url-enabled fields from the URL. The
  // popstate URL is already what the user navigated to, so update the field
  // only — going through setValue would write history again (and urlPush
  // fields would push a new entry, breaking further back-navigation).
  // A field whose param is absent after navigation reverts to its fallback.
  useEffect(() => {
    if (!field.url || typeof window === 'undefined') return;
    const onPop = () => {
      const { props, field, stateKey, tag, fallback } = ref.current;
      const urlValue = getUrlOverride((props as any)?.id, field);
      updateField(props, field, urlValue !== undefined ? urlValue : fallback, { stateKey, tag });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // field.url/name are stable per field declaration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.url, field.name]);

  return [value, setValue];
}

type ReduxAggregateOptions<T, R = any> = {
  fallback?: T;
  tag?: string;
  aggregate?: 'list' | 'object' | ((values: T[], ids: string[]) => R);
};

/**
 * React hook to read the same field for multiple component IDs.
 *
 * This mirrors `useFieldState`'s read-path but aggregates the values from
 * several IDs into either an array (default) or an object keyed by ID.
 */
export function useAggregate<T = any, R = any>(
  props,
  field: FieldInfo,
  stateKeys: StateKey[],
  { fallback, tag, aggregate = 'list' }: ReduxAggregateOptions<T, R> = {}
) {
  assertValidField(field);

  return useSelector(
    (state) => {
      const values = stateKeys.map((stateKey) =>
        fieldSelector(state, props, field, { fallback, stateKey, tag }),
      );

      if (typeof aggregate === 'function') {
        return aggregate(values, stateKeys as unknown as string[]);
      }

      if (aggregate === 'object') {
        return Object.fromEntries(stateKeys.map((key, index) => [key, values[index]]));
      }

      return values;
    },
    shallowEqual,
  );
}

/**
 * React hook to get a component's value by ID with automatic re-rendering.
 *
 * Returns BlockDataResult & { value }:
 * - `value` is guaranteed usable (fallback while loading, real value when ready)
 * - `loading`, `ready`, `error`, `status` report the block's data state
 *
 * Triggers async loading for blocks not yet in Redux.
 *
 * 95% of blocks just destructure `{ value }` and ignore the rest.
 */
export function useValue(
  props: RuntimeProps,
  {
    stateKey,
    target,
    fallback,
  }: {
    stateKey?: StateKey | null;
    target?: StateRef | null;
    fallback?: any;
  } = {}
): BlockDataResult & { value: ObservableValue<any> } {
  // Priority: explicit stateKey > target (resolved) > own component
  const resolvedKey: StateKey | null =
    stateKey !== undefined ? stateKey
    : target !== undefined ? (target ? stateKeyForGlobalRef(target, props.runtime.ns) : null)
    : scopedStateKeyForBlock(props);

  const result = useSelector(
    (state) => valueSelector(props, state, resolvedKey, { fallback }),
    (a, b) => a.value === b.value && a.status === b.status && a.error === b.error
  );

  // Trigger async load if block is unknown in Redux.
  // props is intentionally omitted from the deps: ensureBlock deduplicates via
  // module-level Set, so stale props cannot cause duplicate fetches. Including
  // props would cause spurious effect re-runs.
  const source = props.runtime.olxJsonSources?.[0] ?? 'content';
  const sideEffectFree = props.runtime.sideEffectFree;
  useEffect(() => {
    if (resolvedKey && result.loading) {
      ensureBlock(props, leafDefinitionKeyFromStateKey(resolvedKey), source);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, result.status, source, sideEffectFree]);

  return result;
}

/**
 * React hook for text-display blocks that can receive their source text
 * from any of four places. Pairs with `parsers.text.withTarget()`. Used
 * by blocks like Mermaid, Markdown, and ObservablePlot, whose source
 * text might come from:
 *
 *   - child text          → parsed at parse time into `kids`
 *   - `src=` attribute    → loaded at parse time into `kids`
 *   - own value field     → settable via `<Set target="me" value="..."/>`
 *   - `target=` attribute → reactive read from another block's value
 *
 * All four routes converge on `useValue`, which routes through the
 * appropriate block's value selector. The `withTarget` parserMixin
 * supplies a `selectors.value` that reads `commonFields.value` with a
 * fallback to `kids`, so the static-text and settable-value cases both
 * work without special handling here.
 *
 * - No `target=` → `useValue`'s natural default of "this block" kicks
 *   in: reads through *this* block's selectValue (Redux value → kids).
 * - `target="other"` → reads through the *target* block's selectValue.
 *   If the target also uses this mixin (or any block with a compatible
 *   value field — TextArea, etc.), it just works.
 *
 * 95% of callers can just destructure `{ text }` and let the loading
 * branch render a spinner.
 */
export function useTextContent(
  props: RuntimeProps,
  { fallback = '' }: { fallback?: string } = {}
): { text: string; loading: boolean; error: string | null; ready: boolean } {
  const target = typeof props.target === 'string'
    ? parseAnyStateRef(props.target)
    : undefined;
  const result = useValue(props, { target, fallback });

  const text =
    typeof result.value === 'string'
      ? result.value
      : result.value == null
        ? fallback
        : String(result.value);

  return { text, loading: result.loading, error: result.error, ready: result.ready };
}

/**
 * React hook to get the full Redux state object for a component.
 *
 * INTENDED FOR DEBUGGING/INTROSPECTION ONLY - not for regular block development.
 * Use useFieldSelector or useValue for normal state access.
 *
 * @param {string} stateKey - StateKey of the component to inspect
 * @param {Object} options - Options object
 * @param {string} options.scope - State scope (defaults to 'component')
 * @returns {Object|null} The full state object for the component, or null if none
 */
export function useComponentState(
  stateKey: StateKey,
  { scope = scopes.component }: { scope?: string } = {}
) {
  return useSelector(
    (state: any) => state?.application_state?.[scope]?.[stateKey] || null,
    shallowEqual
  );
}
