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
import { selectBlock } from '@/lib/state/olxjson';
import {
  evaluate, createContext,
  extractStructuredRefs, mergeReferences, EMPTY_REFS,
  selectReferences,
} from '@/lib/stateLanguage';
import type { ParsedStateExpression } from '@/lib/stateLanguage';
import type { KidEntry, OlxJson, RuntimeProps } from '@/lib/types';

type HtmlKid = Extract<KidEntry, { type: 'html' }>;
type StaticHtmlKid = Omit<HtmlKid, 'kids'> & { kids: StaticKid[] };
type StaticKid = Exclude<KidEntry, HtmlKid> | StaticHtmlKid | OlxJson | string;
type WhenByKid = Map<StaticKid, ParsedStateExpression>;

function isStructuredKid(kid: StaticKid): kid is Exclude<StaticKid, string> {
  return typeof kid === 'object' && kid !== null;
}

// Returns the pre-parsed { expr, ast } from the when= attribute, or undefined.
// Pure over the PASSED state — one selectKidsJson evaluation reads whens and
// reference values from the same snapshot (getKidsJson is the only boundary
// that calls getState()).
function getWhen(kid: StaticKid, props: RuntimeProps, reduxState: any): ParsedStateExpression | undefined {
  if (!isStructuredKid(kid)) return undefined;
  if ('type' in kid && kid.type === 'html') return undefined;
  if ('type' in kid && kid.type === 'block') {
    // `when` on a BlockReference belongs to that occurrence of the block.
    // Without an override, the referenced definition supplies the condition.
    if (kid.overrides?.when !== undefined) {
      return kid.overrides.when as unknown as ParsedStateExpression;
    }
    const definitionKey = kid.definitionKey;
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const block = selectBlock(reduxState, sources, definitionKey, props.runtime.locale.code);
    if (!block) return undefined;  // not yet loaded — show by default
    return block.attributes.when as unknown as ParsedStateExpression | undefined;
  }
  if (!('type' in kid)) {
    return kid.attributes.when as unknown as ParsedStateExpression | undefined;
  }
  return undefined;
}

function collectWhens(
  kids: StaticKid[], props: RuntimeProps, reduxState: any,
  whenByKid: WhenByKid = new Map(),
): WhenByKid {
  for (const kid of kids) {
    if (isStructuredKid(kid) && 'type' in kid && kid.type === 'html') {
      collectWhens(kid.kids, props, reduxState, whenByKid);
    }
    const when = getWhen(kid, props, reduxState);
    if (!when) continue;
    whenByKid.set(kid, when);
  }
  return whenByKid;
}

function filterKids(kids: StaticKid[], whenByKid: WhenByKid, ctx: ReturnType<typeof createContext>): StaticKid[] {
  const visibleKids: StaticKid[] = [];
  for (const kid of kids) {
    const when = whenByKid.get(kid);
    if (when && !Boolean(evaluate(when.ast, ctx))) continue;
    visibleKids.push(isStructuredKid(kid) && 'type' in kid && kid.type === 'html'
      ? { ...kid, kids: filterKids(kid.kids, whenByKid, ctx) }
      : kid);
  }
  return visibleKids;
}

/**
 * Pure selector: returns kids as OlxJson nodes with `when=` filtering applied.
 *
 * Use in blueprint functions (advance, canAdvance, actions) where hooks
 * are unavailable.  Composable — wrap with `.length` for kid count, etc.
 */
export function selectKidsJson(props: RuntimeProps, reduxState: any): any[] {
  const rawKids = (props.kids || []) as StaticKid[];
  const whenByKid = collectWhens(rawKids, props, reduxState);
  if (whenByKid.size === 0) return rawKids;

  const allRefs = (() => {
    const entries = [...whenByKid.values()];
    if (entries.length === 0) return EMPTY_REFS;
    return mergeReferences(...entries.map(w => extractStructuredRefs(w.expr)));
  })();

  const resolved = selectReferences(reduxState, props, allRefs);
  const ctx = createContext(resolved);
  return filterKids(rawKids, whenByKid, ctx);
}

/** One-shot imperative form: grabs current state and calls selectKidsJson. */
export function getKidsJson(props: RuntimeProps): any[] {
  return selectKidsJson(props, props.runtime.store.getState());
}
