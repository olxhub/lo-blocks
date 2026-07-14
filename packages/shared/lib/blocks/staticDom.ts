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
import { leafDefinitionKeyFromStateKey, qualifyDefinitionRef, splitScope, addScope } from '../types/id-grammar';
import type { DefinitionKey, DefinitionRef, LoBlock, OlxJson, RuntimeProps, StateKey } from '../types';

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
      const k = kid as { type?: string; id?: string; kids?: unknown };
      if (k.type === 'block' && k.id) {
        // Kid ids may be bare DefinitionRefs (generated content, e.g.
        // MarkupProblem's expansion) or qualified DefinitionKeys
        // (capaParser) — qualify uniformly.
        const defKey = qualifyDefinitionRef(k.id as DefinitionRef, props.runtime.ns);
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

// ─── Instance state-key closure ─────────────────────────────────────────────

/** Runaway guard: a template deeper/wider than this is a content bug —
 * log it rather than silently ensuring half an instance. */
const INSTANCE_CLOSURE_CAP = 500;

/**
 * The state keys a rendered INSTANCE comprises: the root block plus
 * every STATICALLY-reachable descendant block, each scoped by the
 * root's scope. This is what the state lane must resolve before an
 * instance may render — gating only the root key would leave its
 * children free to write-from-empty.
 *
 *   selectInstanceStateKeys(state, props, "ee101/list:#2:tmpl")
 *   → ["ee101/list:#2:tmpl", "ee101/list:#2:vert", "ee101/list:#2:answer", …]
 *
 * Static kids share their parent's scope (only scoping containers extend
 * the idPrefix), so every descendant keys under the SAME prefix. Nested
 * scoping containers cascade instead: their own bucket (the instance
 * count) is in this closure; their instances get ensured after they
 * render and read it — depth = state-determined nesting depth.
 *
 * The walk reads static kids from the content store, so the closure
 * grows as content arrives; callers re-read reactively (useSelector) and
 * re-ensure until it settles. Pure selector — blueprint-safe.
 */
export function selectInstanceStateKeys(
  reduxState: any,
  props: RuntimeProps,
  rootKey: StateKey,
  source: string = 'content',
): StateKey[] {
  const { ns, idPrefix } = splitScope(rootKey);
  const sources = [source];
  const locale = props.runtime.locale.code;

  const keys: StateKey[] = [];
  const visited = new Set<string>();
  const queue: DefinitionKey[] = [splitScope(rootKey).leaf];

  const enqueueBlockRefs = (kids: any) => {
    if (!Array.isArray(kids)) return; // text / parsed payloads have no block refs
    for (const kid of kids) {
      if (kid?.type === 'block' && kid.id) {
        queue.push(qualifyDefinitionRef(kid.id, ns));
      } else if (kid?.type === 'html') {
        enqueueBlockRefs(kid.kids); // html wrappers nest block refs
      }
    }
  };

  while (queue.length > 0) {
    const defKey = queue.shift()!;
    if (visited.has(defKey)) continue; // content is a DAG — visit once
    visited.add(defKey);
    if (visited.size > INSTANCE_CLOSURE_CAP) {
      console.warn(`[staticDom] instance closure of ${rootKey} exceeds `
        + `${INSTANCE_CLOSURE_CAP} blocks — truncating; check the content`);
      break;
    }
    keys.push(addScope(defKey, idPrefix));
    const block = selectBlock(reduxState, sources, defKey, locale);
    if (block) enqueueBlockRefs(block.kids);
  }
  return keys;
}
