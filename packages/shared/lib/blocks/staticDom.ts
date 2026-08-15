// packages/shared/lib/blocks/staticDom.ts
//
// Navigation over the STATIC DOM — the OlxJson content graph in Redux.
// The parallel module to dynamicDom.ts (which navigates the dynamic,
// rendered block DAG): both expose infer-style traversal with a selector;
// callers choose which DOM answers their question. Grading uses THIS one
// (lib/grading/topology.ts): block registry + Redux state + OlxJson are
// enough for everything grading needs.
//
// No parent walks here, by design: <Use> means a static-DOM node can have
// multiple parents (a known to-fix), so upward navigation is ill-defined.
// Ancestry-like facts are derived instead (parse-time stamps, scope
// prefixes — see siblingScopedKey).
//
import { selectBlock } from '../state/olxjson';
import { leafDefinitionKeyFromStateKey } from '../types/id-grammar';
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
 * Infer related blocks by walking a static-DOM kids structure: collect
 * block DefinitionKeys whose blueprint matches the selector, descend
 * through html/non-matching blocks, and stop at matches (boundary
 * semantics: a matched block owns its own subtree).
 *
 * The static counterpart of dynamicDom's inferRelatedNodes — same idea,
 * different DOM: this answers "what does the content declare," not "what
 * is rendered near me."
 */
export function inferKids(
  state: unknown,
  props: RuntimeProps,
  kids: unknown,
  { selector }: { selector: (loBlock: LoBlock, entry: OlxJson) => boolean },
): DefinitionKey[] {
  const found: DefinitionKey[] = [];
  const walk = (kidList: unknown) => {
    if (!Array.isArray(kidList)) return;
    for (const kid of kidList) {
      if (!kid || typeof kid !== 'object') continue;
      const k = kid as { type?: string; definitionKey?: DefinitionKey; stateKey?: StateKey; kids?: unknown };
      if (k.type === 'block' && k.definitionKey) {
        if (k.stateKey && String(k.stateKey) !== String(k.definitionKey)) {
          throw new Error(
            `Static DOM inference cannot traverse <Use> of scoped state "${k.stateKey}". ` +
            'Declare the inferred block directly or wire it explicitly instead.'
          );
        }
        const defKey = k.definitionKey;
        const entry = staticEntry(state, props, defKey);
        if (!entry) continue; // content not loaded yet — heals on its dispatch
        const loBlock = blueprintFor(props, entry);
        if (loBlock && selector(loBlock, entry)) {
          found.push(defKey);      // boundary: don't descend
        } else if (entry) {
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
