// Cells we get wrong that no live subgoal and no declaration accounts for.
//
// Ported from `measured.wrong_cells_without_an_owner` (goal K), SPLIT: python
// resolves the wrong cells, the live subgoal owners and the declarations; this
// applies the exclusions and reports.
//
// EVERY CELL WE GET WRONG NEEDS SOMEWHERE TO LIVE, or the next sweep buries it
// in a median. That is the whole claim, and the exclusions below are each a
// different way a cell can already have a home.
//
// SCOPED BY SIDE, defaulting to every side. The split is what lets the WEB half
// of this question be asked by a reader that has no paper scorer.
//
// PER SIDE, NOT PER CELL: a subgoal about the paper scorer is not a home for a
// cell we get wrong on the OLX prompt.
//
// THREE DECLARATIONS ALSO COUNT AS OWNERSHIP, and leaving any of them out has
// cost a false report:
//   GOLD_DIVERGENCES        -- already carries the reason we miss on purpose;
//                              demanding a QC subgoal too is two names for one
//                              claim.
//   SILENT_GOLD_DIVERGENCES -- this read only the first table, so a cell
//                              declared silently was reported as an orphan the
//                              moment its subgoal closed. That happened minutes
//                              after a subgoal closed, on a cell whose
//                              disposition had been filed with a written reason
//                              earlier the same day.
//   DECLARED_CEILING_CELLS  -- a ceiling is a weaker and different claim than a
//                              divergence: the cell cannot be settled either
//                              way. Conflating them would let a ceiling be
//                              cited as if we had been vindicated.
//
// THE OTHER DIRECTION, and it is not symmetric. A subgoal citing a cell that
// has stopped being wrong is stale -- EXCEPT where the cell is declared at SLOT
// level. A cell can be RIGHT AT THE TOTAL and still be a live finding: one
// subgoal names a cell because three week slots are credited that the grader
// charged, and the two errors cancel to the same total. Treating "total agrees"
// as "problem gone" would retire the cells that exist precisely because the
// total hides them.

/** python's `%g`. */
function g(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const s = Number(n.toPrecision(6)).toString();
  return s === '-0' ? '0' : s;
}

export type WrongCellsPayload = {
  wrong: Array<{ item: string; pid: number; side: string; target: number; ours: number }>;
  /** Sides in scope; python defaults this to all of them. */
  keep: string[];
  /** "item/pN" -> the sides a live subgoal owns it on. */
  ownedBySide: Record<string, string[]>;
  /** "item/pN" -> the OPEN subgoals naming it. */
  subjects: Record<string, string[]>;
  /** "item/pN" keys carrying a declared gold divergence. */
  goldDivergence: string[];
  /** "item/pN" keys in SILENT_GOLD_DIVERGENCES. */
  silent: string[];
  /** "item/pN" keys in DECLARED_CEILING_CELLS. */
  ceiling: string[];
  /** "item/pN" keys that have a recorded score at all. */
  measuredCells: string[];
  /** "item/pN" keys declared at SLOT level, which stay live at the total. */
  slotLive: string[];
};

export function wrongCellsWithoutAnOwner(p: WrongCellsPayload): string[] {
  const keep = new Set(p?.keep ?? []);
  const goldDiv = new Set(p?.goldDivergence ?? []);
  const silent = new Set(p?.silent ?? []);
  const ceiling = new Set(p?.ceiling ?? []);
  const measured = new Set(p?.measuredCells ?? []);
  const slotLive = new Set(p?.slotLive ?? []);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const w of p?.wrong ?? []) {
    if (!keep.has(w.side)) continue;
    const key = `${w.item}/p${w.pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if ((p.ownedBySide?.[key] ?? []).includes(w.side)) continue;
    if (goldDiv.has(key)) continue;
    if (silent.has(key)) continue;
    if (ceiling.has(key)) continue;
    out.push(
      `${key} is WRONG on ${w.side} -- gold ${g(w.target)}, we record ${g(w.ours)} -- ` +
      `and no OPEN subgoal names it. Every cell we get wrong needs ` +
      `somewhere to live, or the next sweep buries it in a median. Name it ` +
      `in the subgoal that owns its shape, or declare it`);
  }

  const stillWrong = new Set((p?.wrong ?? []).map(w => `${w.item}/p${w.pid}`));
  for (const key of Object.keys(p?.subjects ?? {}).sort()) {
    if (stillWrong.has(key) || !measured.has(key) || slotLive.has(key)) continue;
    const who = [...new Set(p.subjects[key])].sort();
    out.push(
      `${key} is named by OPEN subgoal(s) [${who.map(w => `'${w}'`).join(', ')}] but now scores ` +
      `RIGHT at the recorded median on every side. The evidence the ` +
      `subgoal cites has gone: re-read it, and drop the cell or close the ` +
      `subgoal`);
  }
  return out;
}
