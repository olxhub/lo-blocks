// packages/shared/lib/state/sync/aggregations.ts
//
// Aggregation at a distance (docs/state-library-design.md §6): a VIEW
// block declares a fold over ANOTHER block's per-user field —
//
//   <TabularMCQ id="q1"/>  <AnswerDistribution target="q1"/>
//
// The input block stays ordinary (per-user field; it doesn't know it's
// aggregated — every existing input type is aggregatable). The view's
// derived field declares WHAT it derives from:
//
//   { name: 'distribution', people: { everyone: 'derived' },
//     aggregate: { over: 'value', fold: histogram, initial: {} } }
//
// THE INTEGRITY PROPERTY: folds take TRANSITIONS of per-user state, not
// raw events. A student sending twelve writes produces twelve
// transitions ending in one current value — each fold moves their count
// from `prev`'s bin to `next`'s, so "each user counted exactly once, at
// their latest answer" holds by construction. No rate limiting; the
// per-user CRDT state is the dedupe layer.
//
// Seeding: the view's `seed` attribute (JSON) is the fold's base when
// the derived bucket is empty — prior-semester data as content:
// versioned, forkable, diffable. The client uses the same attribute as
// its display fallback, so seeds are visible before the first
// contribution without any server involvement.

import type { FieldInfo } from '../../types';

/** One user's answer changing — what aggregation folds consume. */
export interface Transition {
  prev: unknown;   // undefined on first answer
  next: unknown;
  user: string;
}

/** Declared on a derived field: what it aggregates and how. */
export interface AggregateSpec {
  /** Field name on the TARGET block whose transitions feed the fold. */
  over: string;
  /** (derived, transition) → derived'. Must handle prev === undefined. */
  fold: (derived: any, transition: Transition) => any;
  /** Base value when the bucket is empty and there is no seed. */
  initial: any;
}

/** A view registered against a target: resolved from content + registry. */
export interface AggregationView {
  /** The view block's id — its bucket holds the derived value. */
  viewId: string;
  /** Which field on the view's bucket receives the fold's output. */
  resultField: string;
  spec: AggregateSpec;
  /** The view's seed attribute (JSON string), if any. */
  seed?: string;
}

export interface AggregationIndex {
  /** Views whose folds consume transitions of (targetId, field). */
  viewsFor(targetId: string, field: string): Promise<AggregationView[]>;
}

/** Qualify a target written locally in OLX with the view's namespace —
 * same sibling rule as grouped-by and media targets. */
function qualifyTarget(target: string, viewId: string): string {
  if (target.includes('/')) return target;
  const nsEnd = viewId.lastIndexOf('/');
  return nsEnd < 0 ? target : `${viewId.slice(0, nsEnd)}/${target}`;
}

/**
 * TTL-cached index from content + block registry: scan the idMap for
 * blocks whose blueprint declares an aggregate field and that carry a
 * `target` attribute; map (qualified target id, watched field) → views.
 */
export function makeAggregationIndex(
  loadIdMap: () => Promise<Record<string, Record<string, any>>>,
  fieldsForTag: (tag: string) => Record<string, FieldInfo> | undefined,
  ttlMs = 2000,
): AggregationIndex {
  let byTarget: Map<string, AggregationView[]> | null = null;
  let fetchedAt = 0;
  let inflight: Promise<void> | null = null;

  const rebuild = async () => {
    const idMap = await loadIdMap();
    const next = new Map<string, AggregationView[]>();
    for (const [viewId, variants] of Object.entries(idMap)) {
      for (const variant of Object.values(variants ?? {})) {
        const tag = (variant as any)?.tag;
        const target = (variant as any)?.attributes?.target;
        if (!tag || !target) continue;
        const fields = fieldsForTag(tag);
        if (!fields) continue;
        for (const field of Object.values(fields)) {
          const spec = (field as any)?.aggregate as AggregateSpec | undefined;
          if (!spec) continue;
          const targetId = qualifyTarget(target, viewId);
          const key = `${targetId}|${spec.over}`;
          const view: AggregationView = {
            viewId,
            resultField: field.name,
            spec,
            seed: (variant as any)?.attributes?.seed,
          };
          next.set(key, [...(next.get(key) ?? []), view]);
        }
        break; // one variant is enough — specs are per-blueprint
      }
    }
    byTarget = next;
    fetchedAt = Date.now();
  };

  return {
    async viewsFor(targetId, field) {
      if (!byTarget || Date.now() - fetchedAt > ttlMs) {
        inflight ??= rebuild().finally(() => { inflight = null; });
        await inflight;
      }
      return byTarget!.get(`${targetId}|${field}`) ?? [];
    },
  };
}
