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
// KNOWN LIMITATION: kids hidden by when= are still counted (the dynamic-
// DOM walk excluded them for free). No shipped problem puts when= on a
// grader today; when one does, filter the kid walk through the when=
// machinery (selectKidsJson evaluates it purely from Redux).
//
import { selectBlock } from '../state/olxjson';
import {
  leafDefinitionKeyFromStateKey, siblingScopedKey, stateKeyForGlobalRef, parseAnyStateRef,
  qualifyDefinitionRef,
} from '../types/id-grammar';
import type { DefinitionRef } from '../types';
import type { DefinitionKey, LoBlock, OlxJson, RuntimeProps, StateKey } from '../types';

/** The static-DOM entry for a block, or null if content isn't loaded. */
export function staticEntry(state: unknown, props: RuntimeProps, defKey: DefinitionKey): OlxJson | null {
  const sources = props.runtime.olxJsonSources ?? ['content'];
  return selectBlock(state as any, sources, defKey, props.runtime.locale.code) ?? null;
}

export function staticEntryForStateKey(state: unknown, props: RuntimeProps, stateKey: StateKey): OlxJson | null {
  return staticEntry(state, props, leafDefinitionKeyFromStateKey(stateKey));
}

/** A block's blueprint from its static-DOM entry. */
export function blueprintFor(props: RuntimeProps, entry: OlxJson): LoBlock | undefined {
  return props.runtime.blockRegistry[entry.tag];
}

/**
 * Walk a static-DOM kids structure, collecting block DefinitionKeys that
 * match, descending through html/non-matching blocks, and stopping at
 * matches (boundary semantics: a matched block owns its own subtree).
 */
function collectBoundaryKids(
  state: unknown,
  props: RuntimeProps,
  kids: unknown,
  matches: (loBlock: LoBlock) => boolean,
): DefinitionKey[] {
  const found: DefinitionKey[] = [];
  const walk = (kidList: unknown) => {
    if (!Array.isArray(kidList)) return;
    for (const kid of kidList) {
      if (!kid || typeof kid !== 'object') continue;
      const k = kid as { type?: string; id?: string; kids?: unknown };
      if (k.type === 'block' && k.id) {
        // Kid ids may be bare DefinitionRefs (generated content, e.g.
        // MarkupProblem's expansion) or qualified DefinitionKeys
        // (capaParser) — qualify uniformly.
        const defKey = qualifyDefinitionRef(k.id as DefinitionRef, props.runtime.ns);
        const entry = staticEntry(state, props, defKey);
        if (!entry) continue; // content not loaded yet — heals on its dispatch
        const loBlock = blueprintFor(props, entry);
        if (loBlock && matches(loBlock)) {
          found.push(defKey);      // boundary: don't descend
        } else {
          walk(entry.kids);
        }
      } else if (k.type === 'html') {
        walk(k.kids);
      }
    }
  };
  walk(kids);
  return found;
}

/**
 * The direct child graders a metagrader governs, as instance StateKeys
 * under the metagrader's own scope prefix. Boundary-aware: a nested
 * problem is itself the child; its graders belong to it.
 */
export function childGraderKeys(state: unknown, props: RuntimeProps, metagraderKey: StateKey): StateKey[] {
  const entry = staticEntryForStateKey(state, props, metagraderKey);
  if (!entry) return [];
  const defKeys = collectBoundaryKids(state, props, entry.kids, b => b.isGrader);
  return defKeys.map(defKey => siblingScopedKey(metagraderKey, defKey));
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
export function graderInputKeys(state: unknown, props: RuntimeProps, graderKey: StateKey): StateKey[] {
  const entry = staticEntryForStateKey(state, props, graderKey);
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
      return siblingScopedKey(graderKey, leafDefinitionKeyFromStateKey(global));
    });
  }

  const descriptor = blueprintFor(props, entry)?.grading;
  if (descriptor && descriptor.infer === false) return [];
  const defKeys = collectBoundaryKids(state, props, entry.kids, b => b.isInput);
  return defKeys.map(defKey => siblingScopedKey(graderKey, defKey));
}

/** A grader's blueprint from its instance StateKey (static DOM + registry). */
export function graderBlueprintForKey(state: unknown, props: RuntimeProps, stateKey: StateKey): LoBlock | undefined {
  const entry = staticEntryForStateKey(state, props, stateKey);
  return entry ? blueprintFor(props, entry) : undefined;
}

/**
 * The grading mode of a leaf grader: the parse-time stamp from its
 * enclosing problem (CapaProblem.ts stamps boundary graders), defaulting
 * to submit for standalone graders.
 */
export function gradeModeOf(entry: OlxJson): 'immediate' | 'submit' {
  return entry.attributes.gradeMode === 'immediate' ? 'immediate' : 'submit';
}
