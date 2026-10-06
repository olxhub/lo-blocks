// A recorded verdict that disagrees with what the item's MAPS computes.
//
// Ported from `enforcement.check_mapped_slots_agree_with_their_map` (goal K),
// SPLIT: python walks the run archive, applies the two filters, and tallies;
// this reports what survives.
//
// IT READS ARTIFACTS, NOT THE LEDGER, and that is deliberate: a fault the next
// sweep did not reproduce vanishes from the ledger while remaining true of what
// was recorded. The artifacts are where the behaviour is.
//
// TWO FILTERS KEEP THAT FROM BECOMING A LIST NOBODY READS, both applied before
// anything reaches here:
//
//   ATTRIBUTABLE -- an artifact that cannot say which app code scored it cannot
//     distinguish "it happened once" from "it happened under code that no
//     longer exists". Measured: all four surviving findings came from two
//     artifacts carrying no scoring stamp at all, on different commits, while
//     a current sweep of the same items reproduced none of them.
//   LIVE -- a divergence is an open issue only while its artifact still
//     describes the CURRENT prompt. Anything older is a fact about a prompt
//     that no longer exists. It is not deleted; it is listed on demand. The
//     evidence stays, the alarm stops.
//
// A CHECK THAT CANNOT RUN HAS NOT PASSED. With no output root there are no
// artifacts to read, and that arrives here as a FINDING rather than as an empty
// list, because the two are indistinguishable to a reader otherwise.

export type MappedSlotsPayload = {
  /** Why the run archive could not be reached at all, in python's words. */
  unreadable?: string | null;
  /** Surviving divergences, already ordered by count descending. */
  divergences: Array<{
    dir: string;
    item: string;
    key: string;
    /** The pick that was answered, python-repr'd by the caller. */
    pick: string;
    /** What was RECORDED, python-repr'd. */
    got: string;
    /** What MAPS computes, python-repr'd. */
    want: string;
    n: number;
  }>;
};

export function mappedSlotsAgreeWithTheirMap(p: MappedSlotsPayload): string[] {
  if (p?.unreadable) {
    return [`${p.unreadable} -- this check cannot run, which is NOT the same as passing`];
  }
  return (p?.divergences ?? []).map(d =>
    `${d.dir}: ${d.item}/${d.key} was RECORDED ${d.got} on pick ${d.pick} where ` +
    `MAPS computes ${d.want}, x${d.n}. THE SCORE FOLLOWS THE RECORDED ` +
    `VERDICT ON THE APP AND THE MAP ON THE MIRROR, so the two engines ` +
    `score the same answer differently -- measured per run, every ` +
    `divergent run is a wrong run unless the recorded verdict happens ` +
    `to be score-equivalent to the mapped one`);
}
