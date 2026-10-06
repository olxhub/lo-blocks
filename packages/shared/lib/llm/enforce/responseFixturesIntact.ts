// Every item's reconstruction is recorded, and its shas still describe it.
//
// Ported from `enforcement.check_response_fixtures_are_intact` (goal K).
//
// THE SHA IS THE WHOLE POINT OF FREEZING. For 24 of 26 items the fixture was
// recomputed from the submission on every run, so a change in the segmenter
// silently changed what every sweep scored -- no stamp, no diff, just a rate
// that moved. Extracting the boxes with a sha per cell makes that visible; a
// sha nobody verifies makes it decoration again.
//
// IT NEEDS NO CORPUS, deliberately -- which is why it can live here at all.
// This asks only whether the record is internally consistent and complete: the
// question a reader without the submissions can still answer, and the one that
// catches a silent re-extraction. Whether the record still matches the SOURCE
// is a different question, and it belongs to the side permitted to open a
// submission.
//
// A MISSING RECORD IS A FINDING, not silence. An item with neither a frozen
// source nor an extraction falls back to live segmentation -- exactly the
// arrangement this replaced -- and it would do so without saying so.

export type ResponseFixturesPayload = {
  items: Array<{
    item: string;
    missing?: boolean;
    /** The file's recorded sha, and the sha its cells actually produce. */
    sha?: string;
    computed?: string;
    cells?: Array<{ pid: string; sha?: string; computed?: string }>;
  }>;
  /** Items frozen by an older mechanism, not re-frozen here. */
  frozenElsewhere?: string[];
};

export function responseFixturesAreIntact(p: ResponseFixturesPayload): string[] {
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    if (it.missing) {
      out.push(
        `${it.item}: no frozen reconstruction and no record of one, so its ` +
        `fixture is re-segmented from the submission on every run -- the ` +
        `arrangement freezing replaced, and it would resume silently. Run ` +
        `\`python3 scoring/tools/export_response_fixtures.py\`.`);
      continue;
    }
    if (it.sha !== it.computed) {
      out.push(
        `${it.item}: the file records sha ${it.sha} and its cells now hash to ` +
        `${it.computed} -- the reconstruction changed without the record ` +
        `saying so. Re-extract and read the diff before trusting a sweep.`);
    }
    // PER CELL TOO, because a file-level sha moving tells you THAT something
    // changed and never WHICH cell. That distinction is the difference between
    // a diff someone reads and a diff someone regenerates past.
    for (const c of it.cells ?? []) {
      if (c.sha === c.computed) continue;
      out.push(
        `${it.item}/p${c.pid}: recorded sha ${c.sha}, boxes hash to ` +
        `${c.computed} -- this cell's reconstruction is not what was frozen.`);
    }
  }
  return out;
}
