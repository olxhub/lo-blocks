// Does a gold CORRECTION land on a score the item can actually produce?
//
// Ported from `enforcement.check_gold_corrections_land_on_attainable_scores`
// (goal K). Generic: "a correction that lands off the grid replaces one
// unmatchable gold with another" is arithmetic over an item's own point values.
//
// ATTAINABLE IS COMPUTED, NOT LISTED. A score is `max` minus the sum of SOME
// SUBSET of the scorable components, clamped at 0, plus 0 itself where a gate
// can take the whole item -- so an item whose points change cannot leave a
// stale table behind. `reported` components and those with no `pts` are not
// scorable and take no part.

export type AttainableItem = {
  id: string;
  form: string | number;
  max: number;
  /** Scorable components: points, whether reported, whether the slot gates. */
  credit: Array<{ pts: number | null; reported?: boolean; gates?: boolean }>;
};

export type GoldAttainablePayload = {
  items: AttainableItem[];
  /** Each correction: the cell and the score it sets. */
  corrections: Array<{ item: string; pid: number; score: number }>;
};

/** Python's `f"{v:g}"` -- drops a trailing `.0`, keeps real decimals. */
function g(v: number): string {
  return String(Number(v.toFixed(4)));
}

/** Every score this item can produce, sorted. */
export function attainableScores(it: AttainableItem): number[] {
  const pts = (it.credit ?? [])
    .filter(c => !c.reported && c.pts !== null && c.pts !== undefined)
    .map(c => Number(c.pts));
  const out = new Set<number>([Number(it.max)]);
  // EVERY SUBSET, which is python's `combinations(pts, r)` for r = 1..n taken
  // together. A bitmask enumerates the same set without the nesting.
  for (let mask = 1; mask < (1 << pts.length); mask++) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) if (mask & (1 << i)) sum += pts[i];
    out.add(Math.max(0, Number((it.max - sum).toFixed(4))));
  }
  if ((it.credit ?? []).some(c => c.gates)) out.add(0);
  return [...out].sort((a, b) => a - b);
}

/** The reachable score(s) closest to `score`, or [] when it IS reachable. */
function nearestAttainable(it: AttainableItem, score: number): number[] {
  const scores = attainableScores(it);
  if (scores.some(a => Math.abs(score - a) < 1e-9)) return [];
  const best = Math.min(...scores.map(a => Math.abs(score - a)));
  return scores.filter(a => Math.abs(Math.abs(score - a) - best) < 1e-9);
}

export function goldCorrectionsAreAttainable(p: GoldAttainablePayload): string[] {
  const byId = new Map((p?.items ?? []).map(i => [i.id, i]));
  const out: string[] = [];
  // SORTED BY CELL, as python's `sorted(CORRECTED_GOLD.items())` is: the
  // finding ORDER is part of what a baseline diff compares.
  const fixes = [...(p?.corrections ?? [])].sort((a, b) =>
    a.item < b.item ? -1 : a.item > b.item ? 1 : a.pid - b.pid);
  for (const fix of fixes) {
    const it = byId.get(fix.item);
    if (!it) continue;            // a stale key is another check's finding
    const near = nearestAttainable(it, fix.score);
    if (!near.length) continue;   // empty means the score IS attainable
    out.push(
      `H${it.form} ${fix.item}/p${fix.pid}: the correction sets gold to ` +
      `${g(fix.score)}, which the item cannot produce -- its reachable values ` +
      `near there are ${near.map(g).join(', ')}. A correction that lands off ` +
      `the grid replaces one unmatchable gold with another`);
  }
  return out;
}
