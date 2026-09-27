// Does each declared gold correction still match the sheet it corrects?
//
// Ported from `enforcement.check_corrected_gold_matches_the_sheet` (goal K).
//
// A correction records the value it corrects FROM. If the workbook row has
// since changed, the correction is now about a number nobody marked -- and it
// silently keeps overriding the new one. Four ways it can go wrong: the cell is
// gone, the `was` no longer matches, the correction changes nothing, or it has
// no substantive reason.
//
// IT COMPARES AGAINST THE UNCORRECTED MARK. `gold_rows.json` carries both
// views: `score` has corrections applied (what every consumer wants) and
// `score_raw` is what the workbook says. Comparing `was` against the CORRECTED
// value would report a mismatch on every entry, because that is precisely the
// value the correction produced.

export type CorrectedGoldPayload = {
  /** Uncorrected marks: `{handout: {pid: {item: score|null}}}`, in handout order. */
  raw: Array<{ form: string; rows: Record<string, Record<string, number | null>> }>;
  /** Each declared correction, sorted by cell as python sorts it. */
  fixes: Array<{ item: string; pid: string; was: number; score: number; why: string }>;
};

/** Python's `f"{v:.2f}"`. */
function f2(v: number): string { return v.toFixed(2); }

export function correctedGoldMatchesTheSheet(p: CorrectedGoldPayload): string[] {
  if (!(p?.raw ?? []).length) return [];     // corpus absent on this machine
  const problems: string[] = [];
  for (const fix of p.fixes ?? []) {
    let found: number | null = null;
    // FIRST HANDOUT THAT HAS THE CELL, which is python's `break`: an item id is
    // unique across handouts here, so the first hit is the only hit.
    for (const h of p.raw) {
      const s = (h.rows[fix.pid] ?? {})[fix.item];
      if (s !== undefined && s !== null) { found = Number(s); break; }
    }
    if (found === null) {
      problems.push(
        `CORRECTED_GOLD names ${fix.item}/p${fix.pid}, which has no gold row in ` +
        `any handout. Remove it`);
      continue;
    }
    if (Math.abs(found - fix.was) > 0.005) {
      problems.push(
        `CORRECTED_GOLD[${fix.item}/p${fix.pid}] says it corrects ${f2(fix.was)} ` +
        `but the sheet now reads ${f2(found)}. The row changed under the ` +
        `correction \u2014 re-derive it or remove it`);
    }
    if (Math.abs(found - fix.score) < 0.005) {
      problems.push(
        `CORRECTED_GOLD[${fix.item}/p${fix.pid}] corrects ${f2(found)} to the same ` +
        `value. It is doing nothing \u2014 remove it`);
    }
    if ((fix.why ?? '').split(/\s+/).filter(Boolean).length < 25) {
      problems.push(
        `CORRECTED_GOLD[${fix.item}/p${fix.pid}] has no substantive reason. A ` +
        `correction to the score we are measured against must say what ` +
        `evidence in the submission contradicts the row`);
    }
  }
  return problems;
}
