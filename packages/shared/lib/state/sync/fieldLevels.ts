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
// Same TTL-cached content-scan shape as partitions.ts / aggregations.ts.

import type { FieldInfo } from '../../types';
import { leafDefinitionIdFor } from '@/lib/types/id-grammar';

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
 * means 'user').
 */
export function makeSharedFieldPolicyIndex(
  loadIdMap: () => Promise<Record<string, Record<string, any>>>,
  fieldsForTag: (tag: string) => Record<string, FieldInfo> | undefined,
  ttlMs = 2000,
): SharedFieldPolicyIndex {
  let sharedPoliciesByField: Map<string, SharedFieldPolicy> | null = null;
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

  const rebuild = async () => {
    const idMap = await loadIdMap();
    const next = new Map<string, SharedFieldPolicy>();
    for (const [id, variants] of Object.entries(idMap)) {
      for (const variant of Object.values(variants ?? {})) {
        const tag = (variant as any)?.tag;
        if (!tag) continue;
        addSharedFieldsForDefinition(next, id, tag);
        break; // declarations are per-blueprint; one variant is enough
      }
    }
    sharedPoliciesByField = next;
    fetchedAt = Date.now();
  };

  return {
    async sharedPolicyFor(stateId, field) {
      if (!sharedPoliciesByField || Date.now() - fetchedAt > ttlMs) {
        inflight ??= rebuild().finally(() => { inflight = null; });
        await inflight;
      }
      // A scoped instance inherits its leaf definition's declaration —
      // container segments only scope the instance.
      const definitionId = leafDefinitionIdFor(stateId);
      return sharedPoliciesByField!.get(`${definitionId}|${field}`);
    },
  };
}
