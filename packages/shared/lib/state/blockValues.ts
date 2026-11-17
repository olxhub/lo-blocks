// packages/shared/lib/state/blockValues.ts
//
// valueSelector — the block-value read (a block's `selectors.value` ??
// decoded `value` field) with the loading/error/ready status layer. Pure (no
// React); the hook wrapper useValue lives in fieldHooks.ts.

import { valueFieldFor } from './commonFields';
import { leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { RuntimeProps, StateKey, BlockDataResult } from '../types';
import { asObservableValue } from '../types/fieldValues';
import type { ObservableValue } from '../types/fieldValues';
import { selectBlockState } from './olxjson';
import { blockData, evaluateFieldSelector, selectorReturnsBlockData } from './blockData';
import { resolveTarget, evalGetter, withGetterGuard, decodedFieldSelector, type ResolvedTarget } from './fieldReads';

/**
 * Select a component's value by ID from Redux state.
 *
 * Returns BlockDataResult & { value } — never throws.
 *
 * - If the block is in Redux and ready, calls its selectors.value (or falls back
 *   to the common 'value' field).
 * - If the block is loading or unknown, returns { value: fallback, loading: true }.
 * - If the block errored, returns { value: fallback, error: message }.
 *
 * Blocks whose value selector is wrapped in `withStatus()` return their own BlockDataResult;
 * all others get their raw return value wrapped automatically.
 */
export function valueSelector(
  props: RuntimeProps,
  state: any,
  stateKey: StateKey | null | undefined,
  // `resolved`: a target already resolved by the caller (grading's
  // readGraderInput) — passed through to avoid resolving the same key twice.
  { fallback = '', resolved }: { fallback?: any; resolved?: ResolvedTarget | null } = {}
): BlockDataResult & { value: ObservableValue<any> } {
  // valueSelector is a level-3 read: every exit below is a stamp point where
  // getter-author output (or the fallback) becomes ObservableValue.
  if (stateKey === undefined || stateKey === null) {
    return { value: asObservableValue(fallback), ...blockData('ready') };
  }

  const target = resolved !== undefined ? resolved : resolveTarget(state, props, stateKey);
  if (!target) {
    // Unresolvable: distinguish a load error from content still loading.
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const bs = selectBlockState(state, sources, leafDefinitionKeyFromStateKey(stateKey));
    if (bs?.loadingState?.status === 'error') {
      return { value: asObservableValue(fallback), ...blockData('error', bs.error?.message ?? `Block "${stateKey}" not found`) };
    }
    return { value: asObservableValue(fallback), ...blockData('loading') };
  }

  const valueSelect = target.loBlock.selectors?.value;
  if (valueSelect && selectorReturnsBlockData(valueSelect)) {
    // withStatus selectors (Ref) own their BlockDataResult — pass it through
    // before the level-3 read below would unwrap it. Guarded like any getter
    // (a self-recursive value getter throws instead of hanging).
    return withGetterGuard(stateKey, 'value', () =>
      evaluateFieldSelector(valueSelect, state, target.targetProps, stateKey),
    ) as BlockDataResult & { value: ObservableValue<any> };
  }
  if (valueSelect) {
    // Ordinary value getter: the getter's guard, undefined→fallback, and
    // BlockDataResult-unwrap all come from evalGetter — the same getter
    // evaluation fieldSelector uses, no second target resolution.
    return {
      value: asObservableValue(evalGetter(state, { decl: valueSelect, targetProps: target.targetProps, stateKey }, 'value', fallback)),
      ...blockData('ready'),
    };
  }

  // No value getter: the decoded 'value' field, stamped observable — the
  // TARGET block's own when it declares one (see valueFieldFor). Read with
  // targetProps, not the caller's props: the field is the target's, and a
  // componentSetting-scoped one buckets by props.loBlock.name.
  return {
    value: asObservableValue(
      decodedFieldSelector(state, target.targetProps, valueFieldFor(target.loBlock), { stateKey, fallback })
    ),
    ...blockData('ready'),
  };
}
