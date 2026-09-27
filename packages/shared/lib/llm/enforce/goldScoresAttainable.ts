// Is every gold score one the item can actually produce?
//
// Ported from `enforcement.check_gold_scores_are_attainable` (goal K). The
// sibling of `gold_corrections_land_on_attainable_scores`, which asks the same
// question of the CORRECTIONS; this asks it of every marked cell.
//
// A score off the grid means either the sheet's arithmetic is wrong and belongs
// in `CORRECTED_GOLD`, or the item's costs are. Leaving it relies on
// `scores_as_exact()` absorbing it silently, which is how an off-grid mark
// survives unexamined.
//
// THE ENGINE CAN SEE GOLD AT ALL because python exports the graders' marks to a
// record (`tools/export_grader_marks.py`); the workbooks stay python's to read.

import { attainableScores, type AttainableItem } from './goldAttainable';

export type GoldScorePayload = {
  items: AttainableItem[];
  /** Every marked cell: handout, participant, item, score. */
  cells: Array<{ form: number | string; pid: string; item: string; score: number }>;
};

/** Python's `f"{v:g}"` -- drops a trailing `.0`, keeps real decimals. */
function g(v: number): string { return String(Number(v.toFixed(4))); }

export function goldScoresAreAttainable(p: GoldScorePayload): string[] {
  const byId = new Map((p?.items ?? []).map(i => [i.id, i]));
  const out: string[] = [];
  for (const c of p?.cells ?? []) {
    const item = byId.get(c.item);
    if (!item) continue;
    const scores = attainableScores(item);
    if (scores.some(a => Math.abs(c.score - a) < 1e-9)) continue;
    const best = Math.min(...scores.map(a => Math.abs(c.score - a)));
    const near = scores.filter(a => Math.abs(Math.abs(c.score - a) - best) < 1e-9);
    out.push(
      `H${c.form} ${c.item}/p${c.pid}: gold is ${g(c.score)}, which the item ` +
      `cannot produce -- nearest reachable ` +
      `${near.sort((a, b) => a - b).map(g).join(', ')}. Either the ` +
      `sheet's arithmetic is off-grid and belongs in ` +
      `CORRECTED_GOLD, or the item's costs are wrong; leaving it ` +
      `relies on scores_as_exact() to absorb it silently`);
  }
  return out;
}
