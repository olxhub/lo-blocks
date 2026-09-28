// The web's own judgments, run through PAPER's arithmetic. Do they score alike?
//
// Ported from `enforcement.check_paper_reproduces_web_scores` (goal K), SPLIT:
// python runs the web's recorded judgments through the paper scorer, this
// judges the pairs it comes back with.
//
// THE WIDE HALF OF THE SCORER COMPARISON. The other direction is limited to
// items carrying a recorded PAPER artifact -- two of them. Every item has an
// olx sweep, so this direction covers 26 items and ~3,100 cells.
//
// WHAT MAKES A DIFFERENCE MEAN SOMETHING HERE: the JUDGMENTS ARE HELD FIXED.
// Both numbers are computed from the same recorded model output, so a gap is
// the two implementations of the scoring rules disagreeing -- not the model
// answering differently on two runs, which is what a naive side-by-side sweep
// would have measured and could never have separated.
//
// AN ERROR IS A FINDING, NOT A SKIP. A cell the paper path could not score at
// all is reported in its own words, because "we could not compare these" and
// "these agree" are the same silence otherwise.

export type PaperReproducesPayload = {
  /** One entry per cell whose two numbers differ. */
  differing: Array<{ item: string; pid: number; web: number; paper: number }>;
  /** Whatever stopped a cell being scored, in python's words. */
  errors: string[];
};

/** python's `%g`: trailing zeros dropped, integers printed bare. */
function g(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const s = Number(n.toPrecision(6)).toString();
  return s === '-0' ? '0' : s;
}

export function paperReproducesWebScores(p: PaperReproducesPayload): string[] {
  const out: string[] = [];
  for (const d of p?.differing ?? []) {
    out.push(
      `${d.item}/p${d.pid}: the web's own judgments score ${g(d.web)} on the web and ` +
      `${g(d.paper)} through the paper scorer's arithmetic. The judgments are ` +
      `held fixed, so this is the two scoring implementations disagreeing`);
  }
  for (const e of p?.errors ?? []) {
    out.push(`the web's judgments could not be scored by the paper path -- ${e}`);
  }
  return out;
}
