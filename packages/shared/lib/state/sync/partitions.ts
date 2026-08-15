// Group resolution — which partition of a shared block a user belongs to.
//
// Design (docs/fields-design.md "Groups"): blocks name the PARTITION via
// the `grouped-by` OLX attribute; the server resolves WHICH partition a
// user is in. The client never states its group — the partition never
// comes from the wire, which is the authorization boundary.
//
// This module is the resolver seam. The first resolver reads a field of
// the requesting user's OWN per-user state ("picker-field" grouping):
//
//   <DevQuestion id="topic_picker" options="Cats,Dogs"/>   ← page 2
//   <SharedNotes id="chat" grouped-by="topic_picker.activeIndex"/> ← page 3
//
// The user's committed choice IS their group; trust is trivial because
// reading the user's own choice is as trustworthy as the choice. Future
// resolvers (rosters, enrollment, analytics-computed) plug in behind the
// same groupFor signature.

/** A parsed grouped-by spec: which block's field partitions the users. */
export interface PartitionSpec {
  /** State key of the picker block, ns-qualified. */
  pickerKey: string;
  /** Field name on that block whose value is the group. */
  field: string;
}

/**
 * Parse `grouped-by="picker.field"` relative to the grouped block's id.
 * The picker id is written locally in OLX (authors don't know their
 * namespace); qualify it with the grouped block's ns prefix.
 * `demos/chat` + `topic_picker.activeIndex` → picker `demos/topic_picker`.
 */
export function parsePartitionSpec(spec: string, blockId: string): PartitionSpec | null {
  const dot = spec.lastIndexOf('.');
  if (dot <= 0 || dot === spec.length - 1) return null;
  const picker = spec.slice(0, dot);
  const field = spec.slice(dot + 1);
  const nsEnd = blockId.lastIndexOf('/');
  const pickerKey = picker.includes('/') || nsEnd < 0
    ? picker
    : `${blockId.slice(0, nsEnd)}/${picker}`;
  return { pickerKey, field };
}

/**
 * Resolve a user's group from their per-user state scopes (the shape
 * registry.read returns / a ServerState materializes). Returns undefined
 * when the user hasn't made a choice yet — they interact with the
 * UNPARTITIONED bucket until they do.
 */
export function groupFor(
  userScopes: Record<string, any> | null | undefined,
  spec: PartitionSpec,
): string | undefined {
  const value = userScopes?.component?.[spec.pickerKey]?.[spec.field];
  if (value === undefined || value === null || value === '') return undefined;
  // LWW stateFields store the bare value; structured values stringify.
  // (docField pickers are unsupported: a document's raw value is its
  // update log, which would make a meaningless key — and prose is not
  // what a partition is keyed by. Declare the picker as a stateField.)
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Both directions of the grouping index. */
export interface GroupingIndex {
  /** Grouped block id → its grouped-by spec string, or undefined. */
  specOf(id: string): Promise<string | undefined>;
  /** Picker (state key + field) → the grouped block ids it partitions.
   * The re-subscription path: when a user writes this field, their
   * partition for these blocks changed. */
  groupedBlocksFor(pickerKey: string, field: string): Promise<string[]>;
}

/**
 * TTL-cached grouping index, from content. syncContentFromStorage
 * re-stats the content tree per call — too heavy per event — so the maps
 * refresh at most every TTL ms (2000ms as of 2026-07: content edits take
 * up to one TTL to affect routing; fine).
 */
export function makeGroupingIndex(
  loadIdMap: () => Promise<Record<string, Record<string, any>>>,
  ttlMs = 2000,
): GroupingIndex {
  let specs: Map<string, string> | null = null;
  let byPicker: Map<string, string[]> | null = null;
  let fetchedAt = 0;
  let inflight: Promise<void> | null = null;

  const rebuild = async () => {
    const idMap = await loadIdMap();
    const nextSpecs = new Map<string, string>();
    const nextByPicker = new Map<string, string[]>();
    for (const [id, variants] of Object.entries(idMap)) {
      for (const variant of Object.values(variants ?? {})) {
        const spec = (variant as any)?.attributes?.['grouped-by'];
        if (!spec) continue;
        nextSpecs.set(id, spec);
        const parsed = parsePartitionSpec(spec, id);
        if (parsed) {
          const key = `${parsed.pickerKey}|${parsed.field}`;
          nextByPicker.set(key, [...(nextByPicker.get(key) ?? []), id]);
        }
        break;
      }
    }
    specs = nextSpecs;
    byPicker = nextByPicker;
    fetchedAt = Date.now();
  };

  const fresh = async () => {
    if (!specs || Date.now() - fetchedAt > ttlMs) {
      // Single-flight: concurrent events during a refresh share one scan.
      inflight ??= rebuild().finally(() => { inflight = null; });
      await inflight;
    }
  };

  return {
    async specOf(id) { await fresh(); return specs!.get(id); },
    async groupedBlocksFor(pickerKey, field) {
      await fresh();
      return byPicker!.get(`${pickerKey}|${field}`) ?? [];
    },
  };
}
