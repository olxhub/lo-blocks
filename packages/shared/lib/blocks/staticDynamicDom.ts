// packages/shared/lib/blocks/staticDynamicDom.ts
//
// The BRIDGE from the static DOM to the dynamic (rendered) DOM: which
// static kids should exist in the rendered tree right now?
//
// when= is dynamic in the state-dependent sense (its value changes as the
// learner acts) but this module consumes no rendered tree — it is a pure
// function of (static DOM × Redux state) whose OUTPUT determines what the
// dynamic DOM will contain. Blueprint-safe (no React); the reactive hook
// wrapper (useKidsJson) lives in useRenderedBlock.tsx.
//
// NOT for grading: a problem's grader topology is static by decided
// semantics (lib/grading/topology.ts) — when=-hidden graders/inputs still
// count toward the grade. A problem containing when= on its graders or
// inputs is flagged as an authoring error (whenGatedGradingKids) until a
// real use case shows up.
//
import { qualifyDefinitionRef } from '@/lib/types/id-grammar';
import { selectBlock } from '@/lib/state/olxjson';
import {
  evaluate, createContext,
  extractStructuredRefs, mergeReferences, EMPTY_REFS,
  selectReferences,
} from '@/lib/stateLanguage';
import type { RuntimeProps } from '@/lib/types';

// Returns the pre-parsed { expr, ast } from the when= attribute, or undefined.
function getWhen(kid: any, props: RuntimeProps) {
  if (kid.type === 'block') {
    const definitionKey = qualifyDefinitionRef(kid.id, props.runtime.ns);
    const reduxState = props.runtime.store.getState();
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const block = selectBlock(reduxState, sources, definitionKey, props.runtime.locale.code);
    if (!block) return undefined;  // not yet loaded — show by default
    return block.attributes.when;
  }
  if (kid.tag) {
    return kid.attributes.when;
  }
  return undefined;
}

function collectWhens(kids: any[], props: RuntimeProps) {
  const map: Record<string, any> = {};
  for (const kid of kids) {
    const when = getWhen(kid, props);
    if (!when) continue;
    map[kid.id] = when;
  }
  return map;
}

/**
 * Pure selector: returns kids as OlxJson nodes with `when=` filtering applied.
 *
 * Use in blueprint functions (advance, canAdvance, actions) where hooks
 * are unavailable.  Composable — wrap with `.length` for kid count, etc.
 */
export function selectKidsJson(props: RuntimeProps, reduxState: any): any[] {
  const rawKids = (props.kids || []) as any[];
  const whenMap = collectWhens(rawKids, props);
  if (Object.keys(whenMap).length === 0) return rawKids;

  const allRefs = (() => {
    const entries = Object.values(whenMap) as { expr: string }[];
    if (entries.length === 0) return EMPTY_REFS;
    return mergeReferences(...entries.map(w => extractStructuredRefs(w.expr)));
  })();

  const resolved = selectReferences(reduxState, props, allRefs);
  const ctx = createContext(resolved);
  return rawKids.filter(kid => {
    const when = whenMap[kid.id];
    if (!when) return true;
    return Boolean(evaluate(when.ast, ctx));
  });
}

/** One-shot imperative form: grabs current state and calls selectKidsJson. */
export function getKidsJson(props: RuntimeProps): any[] {
  return selectKidsJson(props, props.runtime.store.getState());
}
