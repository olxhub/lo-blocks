// Every declared tag-only edit still has the question it was declared for.
//
// Ported from `enforcement.check_ask_equivalences_still_hold` (goal K), SPLIT:
// python re-derives each row's CURRENT ask fingerprint, this judges the pair.
//
// WHAT A ROW CLAIMS AND HOW IT EXPIRES. The declaration says "this superseded
// prompt asked the same thing", which is true when written and can stop being
// true: change the wording afterwards and the row goes on excusing artifacts
// recorded against a DIFFERENT question. The resolver already refuses such a
// row -- silently. This says so out loud, because a declaration that has
// quietly stopped applying is one nobody ever removes.
//
// ONE VALUE IS COMPUTED, THE OTHER IS DECLARED, which is why this does not hit
// the hazard `paper_prompt_is_stamped` records: there, both sides of the
// comparison came from one function and recomputing either half natively would
// have masked the bug. Here the declared fingerprint is a literal in a table
// and only `now` is derived, so nothing is lost by judging them here.
//
// A ROW THAT CANNOT BE RE-DERIVED IS A FINDING, not a skip: an equivalence
// nobody can re-test is doing its excusing on trust.

export type AskEquivalencePayload = {
  rows: Array<{
    item: string;
    side: string;
    /** The superseded prompt the row was declared for. */
    was: string;
    /** The ask fingerprint the declaration names. */
    declared: string;
    /** The fingerprint now, or null when it could not be re-derived. */
    now?: string | null;
    /** python's exception TYPE, which is all the message quotes. */
    error?: string | null;
    /** The declaration's own reason, quoted back in the removal instruction. */
    why: string;
  }>;
};

export function askEquivalencesStillHold(p: AskEquivalencePayload): string[] {
  const out: string[] = [];
  for (const r of p?.rows ?? []) {
    if (r.error) {
      out.push(
        `${r.item}/${r.side}: cannot re-derive ask_sha to check the ` +
        `declared equivalence for ${r.was}: ${r.error}`);
      continue;
    }
    if (r.now !== r.declared) {
      out.push(
        `${r.item}/${r.side}: the equivalence declared for prompt ${r.was} names ` +
        `ask_sha ${r.declared}, but the question is now ${r.now} -- the row no ` +
        `longer applies and artifacts stamped ${r.was} are genuinely ` +
        `history. Remove it (${r.why}).`);
    }
  }
  return out;
}
