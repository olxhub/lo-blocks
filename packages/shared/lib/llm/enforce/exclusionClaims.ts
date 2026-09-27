// Does an `unscoreable` reason state a point figure that nothing checks?
//
// Ported from `enforcement.check_exclusion_claims_are_data` (goal K). Generic:
// "a claim about a NUMBER left in prose goes stale without anything noticing"
// assumes nothing about any course -- the cells, the reasons and the
// declarations all arrive as data.
//
// THE FAILURE IT EXISTS FOR. An `unscoreable` reason asserted "the CLI's error
// here is exactly -2.50" while every run measured -1.25, and the sentence went
// on pointing future work at a fixture reconstruction when the whole story was
// a declared divergence. Declaring the figure as `expect_error` makes it an
// assertion the harnesses check every run; leaving it in prose makes it
// decoration.

export type ExclusionCell = {
  item: string;
  pid: number;
  /** The reason prose. */
  why: string;
  /** Does the entry declare `expect_error`, making the figure checkable? */
  declared: boolean;
};

export type ExclusionClaimsPayload = { cells: ExclusionCell[] };

// PYTHON'S REGEX, CHARACTER FOR CHARACTER: a decimal with either sign, or a
// SIGNED integer. An unsigned integer is deliberately not a claim -- "gold 0"
// and "all four weeks" are ordinary prose, and matching them would flag every
// reason in the table.
const CLAIM = /[-+]?\d+\.\d+|[-+]\d+\b/g;

export function exclusionClaimsAreData(p: ExclusionClaimsPayload): string[] {
  const problems: string[] = [];
  for (const c of p?.cells ?? []) {
    const found = String(c.why ?? '').match(CLAIM) ?? [];
    if (!found.length || c.declared) continue;
    // `sorted(set(found))` -- python sorts the DEDUPED figures as STRINGS, so
    // "-2.50" orders before "-1.25" lexically, not numerically. Matching that
    // matters: the finding text is what a baseline diff compares.
    const figures = [...new Set(found)].sort();
    problems.push(
      `${c.item}/p${c.pid}: the \`unscoreable\` reason states the point ` +
      `figure(s) [${figures.map(f => `'${f}'`).join(', ')}] in prose, where nothing ` +
      `checks them. Declare \`expect_error\` on the entry so the ` +
      `harnesses assert it every run, or drop the figure`);
  }
  return problems;
}
