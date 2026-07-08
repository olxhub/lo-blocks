// packages/shared/lib/state/sync/fieldLevels.ts
//
// The TRUSTED level lookup — which LEVEL a (block, field) lives at, from
// content + the block registry, never from the wire. Clients stamp their
// events with an authority hint (redux.ts), but a hint is all it is: a
// malicious or buggy client could stamp any event 'shared' and write
// into everyone's state. Routing (router.ts) therefore derives the level
// here — block tag from the content idMap, field declarations from the
// blueprint — and treats undeclared fields as level 'user' (fail
// closed: a forgotten declaration keeps data private, never the
// reverse).
//
// Same TTL-cached content-scan shape as partitions.ts / aggregations.ts.

import type { FieldInfo } from '../../types';

/** What routing needs to know about a declared level>user field. */
export interface FieldLevelInfo {
  level: 'everyone';
  delivery: 'events' | 'folded';
}

export interface FieldLevelIndex {
  /** The field's declared level info, or undefined for level 'user'
   * (the default — undeclared fields are private). */
  levelOf(blockId: string, field: string): Promise<FieldLevelInfo | undefined>;
}

/**
 * TTL-cached index from content + block registry: block id → tag →
 * blueprint fields; only level>user declarations are indexed (absence
 * means 'user'). Scoped state keys (`defId#anchor`) share their
 * definition's declaration.
 */
export function makeFieldLevelIndex(
  loadIdMap: () => Promise<Record<string, Record<string, any>>>,
  fieldsForTag: (tag: string) => Record<string, FieldInfo> | undefined,
  ttlMs = 2000,
): FieldLevelIndex {
  let byKey: Map<string, FieldLevelInfo> | null = null;
  let fetchedAt = 0;
  let inflight: Promise<void> | null = null;

  const rebuild = async () => {
    const idMap = await loadIdMap();
    const next = new Map<string, FieldLevelInfo>();
    for (const [id, variants] of Object.entries(idMap)) {
      for (const variant of Object.values(variants ?? {})) {
        const tag = (variant as any)?.tag;
        if (!tag) continue;
        const fields = fieldsForTag(tag);
        if (fields) {
          for (const field of Object.values(fields)) {
            if (!field.level || field.level === 'user') continue;
            next.set(`${id}|${field.name}`, {
              level: field.level,
              delivery: field.delivery ?? 'events',
            });
          }
        }
        break; // declarations are per-blueprint; one variant is enough
      }
    }
    byKey = next;
    fetchedAt = Date.now();
  };

  return {
    async levelOf(blockId, field) {
      if (!byKey || Date.now() - fetchedAt > ttlMs) {
        inflight ??= rebuild().finally(() => { inflight = null; });
        await inflight;
      }
      const hash = blockId.indexOf('#');
      const defId = hash > 0 ? blockId.slice(0, hash) : blockId;
      return byKey!.get(`${defId}|${field}`);
    },
  };
}
