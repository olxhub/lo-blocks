// A sweep on disk that is newer than the one recorded.
//
// Ported from `enforcement.check_every_sweep_is_recorded` (goal K), SPLIT:
// python walks the run archive and decides which candidates are genuinely
// newer, right-shaped and right-model; this judges what to say about them.
//
// WHY THE SPLIT FALLS SO FAR TOWARD PYTHON. Every input is the archive: which
// artifacts exist, when the GRADER ran (not when the file was written), what
// program produced them, which model, and how many cells the provider never
// returned JSON for. None of that is reconstructible from the tree.
//
// THE JUDGEMENT THAT MOVES IS THE ONE THAT WAS WRONG ONCE. A newer sweep is
// not automatically a better one:
//
//   NEWER AND CLEAN     -> record it, or every check reads a superseded
//                          measurement and describes a tree that has moved on;
//   NEWER WITH FAILED CELLS -> a cell-fill, NOT a backlog. One such artifact
//                          was newer than the recorded columns and carried six
//                          cells the provider never answered; the recorded
//                          3-run artifacts were CLEAN, so the newer one was
//                          worse, not later. Telling a reader to "record this"
//                          sends them at a refusal.
//
// The two are reported separately and in that order, because the incomplete
// one is advice about different work.

export type SweepRecordedPayload = {
  rows: Array<{
    item: string;
    side: string;
    /** What the ledger says is recorded, or empty when nothing is. */
    recordedOut?: string | null;
    /** Candidate names, already formatted, that are newer and CLEAN. */
    newer: string[];
    /** Candidate names with their failed-cell counts, newer but unrecordable. */
    incomplete: string[];
    /**
     * How many candidates the glob returned for this (item, side), and how many
     * PASSED THE SHAPE TEST -- counted before the recency filter, because
     * counting after it reads zero on a healthy tree where nothing is newer.
     *
     * Optional so an older payload still validates; a payload carrying none at
     * all says so rather than skipping the test silently.
     */
    considered?: number;
    inspected?: number;
  }>;
};

export function everySweepIsRecorded(p: SweepRecordedPayload): string[] {
  const out: string[] = [];
  for (const r of p?.rows ?? []) {
    if (r.incomplete?.length) {
      out.push(
        `${r.item} [${r.side}]: a NEWER sweep exists and cannot be ` +
        `recorded -- ${r.incomplete.slice(0, 3).join(', ')}. The provider ` +
        `returned nothing parseable for those cells, so the run ` +
        `judged nothing there. Fill them with a cell-level sweep ` +
        `and re-fold BEFORE recording; until then the older, ` +
        `complete artifact is the better measurement and is ` +
        `correctly the one recorded`);
    }
    if (r.newer?.length) {
      out.push(
        `${r.item} [${r.side}]: ${r.newer.length} sweep artifact(s) on disk are ` +
        `NEWER than the one recorded` +
        (r.recordedOut ? ` (${r.recordedOut})` : ' (none recorded)') +
        ` -- ${r.newer.slice(0, 3).join(', ')}` +
        (r.newer.length > 3 ? ' ...' : '') +
        '. Record it: until then every check reads the superseded ' +
        'measurement, and the findings it produces describe a tree ' +
        'that has already moved on');
    }
  }

  // A CHECK ARM THAT INSPECTED NOTHING IS NOT A PASSING ARM.
  //
  // `check_every_check_is_invoked` already reports CHECK NEVER RUNS for a
  // verifier "registered but never invoked -- it reads as coverage and enforces
  // nothing". An ARM of a check can be dead the same way while the check as a
  // whole looks healthy, and this one WAS: the side contract held a TUPLE of
  // programs for the web column and a bare STRING for the paper ones, and the
  // shape test compared a string against the field with `!=`. Paper passed 26
  // candidates and looked fine; the web column skipped all 147 and reported no
  // unrecorded sweep because nothing reached the test -- on the side whose
  // staleness this check exists to catch.
  //
  // PER SIDE, NOT PER ROW: one item legitimately having no candidates says
  // nothing, and 26 identical findings train a reader to skim.
  const rows = p?.rows ?? [];
  const counted = rows.some(r => r.considered !== undefined || r.inspected !== undefined);
  if (rows.length && !counted) {
    // A SKIP IS NOT A PASS: say the test could not run rather than passing it.
    out.push(
      'this payload carries no `considered`/`inspected` counters, so whether ' +
      'each side INSPECTED anything could not be checked. The arm that hid a ' +
      'live defect was invisible for exactly this reason');
  } else if (counted) {
    const bySide = new Map<string, { considered: number; inspected: number }>();
    for (const r of rows) {
      const acc = bySide.get(r.side) ?? { considered: 0, inspected: 0 };
      acc.considered += r.considered ?? 0;
      acc.inspected += r.inspected ?? 0;
      bySide.set(r.side, acc);
    }
    for (const [side, acc] of [...bySide.entries()].sort()) {
      if (acc.considered > 0 && acc.inspected === 0) {
        out.push(
          `[${side}]: considered ${acc.considered} candidate artifact(s) and ` +
          `accepted NONE of them. This side reports no unrecorded sweep ` +
          `because nothing reached the test, not because nothing was newer -- ` +
          `an arm that examined nothing has not passed. Either the side ` +
          `contract's shape disagrees with what the artifacts declare, or this ` +
          `column has never been swept; both are worth knowing and neither is ` +
          `a clean result`);
      }
    }
  }

  return out;
}
