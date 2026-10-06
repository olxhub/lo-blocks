// A declared scoring divergence whose arithmetic no longer holds.
//
// Ported from `enforcement.check_divergence_arithmetic_is_still_true` (goal K).
//
// A DIVERGENCE DECLARATION IS A MEASUREMENT WITH A DATE ON IT. It says the
// sheet's slots sum to one number against a max of another, and that the gap is
// deliberate. When the sheet is corrected the gap closes, the declaration stops
// describing anything -- and nothing reports it, because a declaration that
// excuses a difference which no longer exists excuses nothing and looks
// perfectly well behaved.
//
// THE CLAIM IS PARSED FROM THE PROSE, because that is where it was written.
// Declarations are argued in sentences; the numbers in them are the claim.

export type DivergenceArithmeticPayload = {
  entries: Array<{
    /** The declaration's `what`, quoted into the finding. */
    what: string;
    /** `what` and `why` joined, which is what the claim is searched in. */
    blob: string;
    items: Array<{ item: string; webMax: number | null; rubricMax: number | null }>;
  }>;
};

const CLAIM = /sum to (\d+(?:\.\d+)?)\b[\s\S]*?max of (\d+(?:\.\d+)?)/i;

export function divergenceArithmetic(p: DivergenceArithmeticPayload): string[] {
  const out: string[] = [];
  for (const entry of p.entries ?? []) {
    const m = CLAIM.exec(entry.blob ?? '');
    if (!m) continue;
    const claimedWeb = Number.parseFloat(m[1]);
    const claimedRubric = Number.parseFloat(m[2]);
    for (const it of entry.items ?? []) {
      if (it.webMax === null || it.webMax === undefined) continue;
      if (it.webMax === claimedWeb && it.rubricMax === claimedRubric) continue;
      out.push(
        `SCORING_DIVERGENCES declares for ${it.item}: ` +
        `"${String(entry.what ?? '').slice(0, 70)}" -- claiming web_max ` +
        `${g(claimedWeb)} against rubric max ${g(claimedRubric)}. The sheet now ` +
        `computes web_max ${g(it.webMax)} against rubric max ${g(it.rubricMax)}. ` +
        `The divergence was FIXED and the declaration outlived it; retire the entry`);
    }
  }
  return out;
}

/** python's `%g`: the shortest form that round-trips, no trailing zeros. */
function g(v: number | null): string {
  if (v === null || v === undefined) return 'None';
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(6)));
}
