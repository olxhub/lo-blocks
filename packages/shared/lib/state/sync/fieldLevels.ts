// packages/shared/lib/state/sync/fieldLevels.ts
//
// The TRUSTED level lookup — which LEVEL a (block, field) lives at, from
// content + the block registry, never from the wire. Clients stamp their
// events with an authority hint (redux.ts), but a hint is all it is: a
// malicious or buggy client could stamp any event 'shared' and write
// into everyone's state. Routing (router.ts) therefore derives the level
// here — block tag from the content idMap, field declarations from the
// blueprint — and treats undeclared fields as level 'user' (fail closed:
// a forgotten declaration keeps data private, never the reverse).
//
// The untrusted part is the whole KEY, not just the authority stamp. A
// scoped state id ("ns/list:#2:notes") names a chain of definitions, and
// the client picks that string: fabricate a chain whose LEAF is a
// declared-shared block ("ns/anything:#x:notes") and a leaf-only lookup
// would hand back the shared policy, folding the event into a persistent
// shared bucket under an id no content ever produces — cross-content
// injection, plus unbounded bucket creation. So a shared policy is
// granted only when the id's definition chain is a real chain in trusted
// content: INV-2 (state topology is a pure function of static content +
// registry — docs/architecture/state-refactor/state-and-grading-design.md
// §5.2/§7) applied to routing.
//
// Same TTL-cached content-scan shape as partitions.ts / aggregations.ts.

import type { FieldInfo } from '../../types';
import {
  allDefinitionKeysFromStateKey,
  asDefinitionKey,
  isNamespaceQualified,
  joinNs,
  splitNs,
  tryParseStateKey,
} from '@/lib/types/id-grammar';

/** The routing policy for a field DECLARED shared. Absence from the
 * index means level 'user' — that absence-is-private rule is the
 * security policy (fail closed). */
export interface SharedFieldPolicy {
  level: 'everyone';
  delivery: 'events' | 'folded';
}

export interface SharedFieldPolicyIndex {
  /** The field's shared policy, or undefined for level 'user' (the
   * default — undeclared fields are private). `stateId` is the event's
   * runtime state id: usually a StateKey (possibly scoped), but
   * settings tags and system ids pass through here too — hence string,
   * normalized at the boundary inside. */
  sharedPolicyFor(stateId: string, field: string): Promise<SharedFieldPolicy | undefined>;
}

/**
 * TTL-cached index from content + block registry: block id → tag →
 * blueprint fields; only level>user declarations are indexed (absence
 * means 'user'). The same scan records which definitions each definition
 * statically contains — the trust gate for scoped state ids.
 */
export function makeSharedFieldPolicyIndex(
  loadIdMap: () => Promise<Record<string, Record<string, any>>>,
  fieldsForTag: (tag: string) => Record<string, FieldInfo> | undefined,
  ttlMs = 2000,
): SharedFieldPolicyIndex {
  let sharedPoliciesByField: Map<string, SharedFieldPolicy> | null = null;
  /** definitionId → the definitions its content declares as kids. Every
   * compiled definition gets an entry (empty when it has no block kids),
   * so membership doubles as "this definition exists in content". */
  let kidDefinitions: Map<string, Set<string>> | null = null;
  let fetchedAt = 0;
  let inflight: Promise<void> | null = null;

  /** Index every level>user field the definition's blueprint declares
   * (absence means 'user'), keyed `<definitionId>|<field>`. */
  const addSharedFieldsForDefinition = (
    index: Map<string, SharedFieldPolicy>,
    definitionId: string,
    tag: string,
  ): void => {
    const fields = fieldsForTag(tag);
    if (!fields) return;
    for (const field of Object.values(fields)) {
      if (!field.level || field.level === 'user') continue;
      index.set(`${definitionId}|${field.name}`, {
        level: field.level,
        delivery: field.delivery ?? 'events',
      });
    }
  };

  /** Record the block kids a variant's parsed content declares. Kid ids
   * are bare DefinitionRefs (PEG-generated content) or qualified
   * DefinitionKeys (OLX parsing) — qualified uniformly against the
   * parent's namespace, as staticDom's walk does. `html` kids nest, so
   * descend into them; string / PEG-object kids carry no block refs. */
  const addKidDefinitions = (kids: Set<string>, parentId: string, node: unknown): void => {
    if (!Array.isArray(node)) return;
    const ns = isNamespaceQualified(parentId)
      ? splitNs(asDefinitionKey(parentId)).ns
      : undefined;
    for (const kid of node) {
      if (!kid || typeof kid !== 'object') continue;
      const k = kid as { type?: string; id?: unknown; kids?: unknown };
      if (k.type === 'block' && typeof k.id === 'string') {
        kids.add(!ns || isNamespaceQualified(k.id) ? k.id : joinNs(ns, k.id));
      } else if (k.type === 'html') {
        addKidDefinitions(kids, parentId, k.kids);
      }
    }
  };

  const rebuild = async () => {
    const idMap = await loadIdMap();
    const next = new Map<string, SharedFieldPolicy>();
    const nextKids = new Map<string, Set<string>>();
    for (const [id, variants] of Object.entries(idMap)) {
      let declared = false;
      for (const variant of Object.values(variants ?? {})) {
        const tag = (variant as any)?.tag;
        if (!tag) continue;
        if (!declared) {
          addSharedFieldsForDefinition(next, id, tag);
          declared = true; // declarations are per-blueprint; one variant is enough
        }
        // Containment, unlike declarations, is per-variant: a translated
        // variant renders the kids IT declares, so union them all.
        let kids = nextKids.get(id);
        if (!kids) nextKids.set(id, kids = new Set<string>());
        addKidDefinitions(kids, id, (variant as any).kids);
      }
    }
    sharedPoliciesByField = next;
    kidDefinitions = nextKids;
    fetchedAt = Date.now();
  };

  /** Does `containerId`'s static content place `childId` somewhere
   * inside it? Reachability, not a direct-kid test: a scope path records
   * only the SCOPING containers, while content freely wraps — a
   * DynamicList's kid is typically a Vertical holding the block whose
   * state key the list scopes. Cycles are possible via <Use>; `seen`
   * bounds the walk.
   *
   * TODO(chain-attr-refs): the walk sees only `kids`. A container that
   * renders blocks through ref-typed ATTRIBUTES (MasteryBank's
   * problemIds) has no kid edge to them, so a shared field on such a
   * block would fail closed here (level user). No current block both
   * declares level>user and lives behind an attribute ref, so this is
   * unreachable today; widening needs getRefAttributes + the block
   * registry threaded into this index's constructor. */
  const staticallyContains = (containerId: string, childId: string): boolean => {
    const seen = new Set<string>([containerId]);
    const queue = [containerId];
    while (queue.length) {
      for (const kid of kidDefinitions!.get(queue.shift()!) ?? []) {
        if (kid === childId) return true;
        if (seen.has(kid)) continue;
        seen.add(kid);
        queue.push(kid);
      }
    }
    return false;
  };

  /** The trust gate for a scoped id: is this definition chain one that
   * trusted content could actually produce? Every definition must exist,
   * and each must contain the next. Scope INDICES ("#2") are NOT checked
   * — only the parent's own state knows how many instances exist, and
   * they are not the injection surface: the chain is what points an
   * event at a shared bucket. */
  const isTrustedChain = (chain: string[]): boolean => {
    for (const definitionId of chain) {
      if (!kidDefinitions!.has(definitionId)) return false;
    }
    for (let i = 0; i + 1 < chain.length; i++) {
      if (!staticallyContains(chain[i], chain[i + 1])) return false;
    }
    return true;
  };

  return {
    async sharedPolicyFor(stateId, field) {
      if (!sharedPoliciesByField || Date.now() - fetchedAt > ttlMs) {
        inflight ??= rebuild().finally(() => { inflight = null; });
        await inflight;
      }
      const key = tryParseStateKey(stateId);
      // Not a StateKey (componentSetting tags, system ids): no chain to
      // walk — it is its own lookup id, and an unknown one is level user.
      if (!key) return sharedPoliciesByField!.get(`${stateId}|${field}`);
      // A scoped instance inherits its leaf definition's declaration —
      // container segments only scope the instance — but only once the
      // chain that names those containers checks out against content.
      const chain = allDefinitionKeysFromStateKey(key);
      if (chain.length > 1 && !isTrustedChain(chain)) return undefined;
      return sharedPoliciesByField!.get(`${chain[chain.length - 1]}|${field}`);
    },
  };
}
