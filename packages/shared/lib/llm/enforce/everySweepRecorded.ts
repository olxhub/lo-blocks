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
  return out;
}
