// packages/shared/lib/grading/topology.ts
//
// Grading topology from the STATIC DOM (OlxJson in Redux) — never the
// dynamic (rendered) DOM. The invariant: block registry + Redux state +
// OlxJson are enough for everything, so grading runs identically in
// selectors, analytics, replay, and server code, and never depends on
// what happens to be mounted (content gating must not require rendering).
//
// Scope prefixes (DynamicList, MasteryBank attempts) are shared by
// everything inside the container — problem, graders, inputs — so a
// member's instance StateKey is derivable from any anchor member's key
// plus the member's DefinitionKey (siblingScopedKey).
//
// SEMANTICS (decided, not a limitation): a problem's grader topology is
// STATIC. Kids hidden by when= still count toward grading. If visibility
// could add or remove graders, the problem's grade would be a function of
// transient render state, and everything downstream of grades — progress
// tracking, learning analytics, gamification, completion gating — would
// inherit that instability through dependencies that are practically
// impossible to analyze. A homework may have a variable number of
// problems (a container concern); a problem does not have a variable set
// of graders.
//
import {
  leafDefinitionKeyFromStateKey, siblingScopedKey, stateKeyForGlobalRef, parseAnyStateRef,
} from '../types/id-grammar';
import { staticEntryForStateKey, blueprintFor, inferKids } from '../blocks/staticDom';
import type { OlxJson, RuntimeProps, StateKey } from '../types';

/**
 * The direct child graders a metagrader governs, as instance StateKeys
 * under the metagrader's own scope prefix. Boundary-aware: a nested
 * problem is itself the child; its graders belong to it.
 */
export function childGraderStateKeys(state: unknown, props: RuntimeProps, metagraderStateKey: StateKey): StateKey[] {
  const entry = staticEntryForStateKey(state, props, metagraderStateKey);
  if (!entry) return [];
  const defKeys = inferKids(state, props, entry.kids, { selector: b => b.isGrader });
  return defKeys.map(defKey => siblingScopedKey(metagraderStateKey, defKey));
}

/**
 * The inputs a grader grades, as instance StateKeys.
 *
 * target= (auto-wired by the problem parser, or authored) is the primary
 * wiring. Bare refs resolve as SIBLINGS — under the grader's own scope
 * prefix — which is what makes <DynamicList><CapaProblem/></DynamicList>
 * grade each instance's own inputs. Already-scoped or cross-namespace refs
 * pass through globally. Without target=, graders that infer collect input
 * blocks from their own static kids.
 */
export function graderInputStateKeys(state: unknown, props: RuntimeProps, graderStateKey: StateKey): StateKey[] {
  const entry = staticEntryForStateKey(state, props, graderStateKey);
  if (!entry) return [];

  const target = entry.attributes.target;
  if (target) {
    const refs = Array.isArray(target)
      ? target.map(String)
      : String(target).split(',').map(t => t.trim()).filter(Boolean);
    return refs.map(ref => {
      // Explicitly scoped ("list:#0:x") or namespace-qualified ("ns/x")
      // refs are global cross-references; bare refs are siblings under
      // this grader instance's scope.
      const global = stateKeyForGlobalRef(parseAnyStateRef(ref), props.runtime.ns);
      if (ref.includes(':') || ref.includes('/')) return global;
      return siblingScopedKey(graderStateKey, leafDefinitionKeyFromStateKey(global));
    });
  }

  const descriptor = blueprintFor(props, entry)?.grading;
  if (descriptor && descriptor.infer === false) return [];
  const defKeys = inferKids(state, props, entry.kids, { selector: b => b.isInput });
  return defKeys.map(defKey => siblingScopedKey(graderStateKey, defKey));
}

/**
 * The grading mode of a leaf grader: the parse-time stamp from its
 * enclosing problem (CapaProblem.ts stamps boundary graders), defaulting
 * to submit for standalone graders.
 */
export function gradeModeOf(entry: OlxJson): 'immediate' | 'submit' {
  return entry.attributes.gradeMode === 'immediate' ? 'immediate' : 'submit';
}

/**
 * Grading blocks (a problem's graders and their inputs) that carry when=.
 * Grader topology is static — when=-hidden blocks still count toward the
 * grade — so visibility on a grading block almost certainly doesn't do
 * what the author expects. Surfaced as an authoring error (CapaProblem)
 * until a real use case shows up.
 */
export function whenGatedGradingKids(state: unknown, props: RuntimeProps, problemStateKey: StateKey): StateKey[] {
  const hasWhen = (stateKey: StateKey): boolean =>
    staticEntryForStateKey(state, props, stateKey)?.attributes.when !== undefined;
  return childGraderStateKeys(state, props, problemStateKey)
    .flatMap(graderKey => [graderKey, ...graderInputStateKeys(state, props, graderKey)])
    .filter(hasWhen);
}
