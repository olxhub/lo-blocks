// Does every recorded WEB column say which app code produced it?
//
// Ported from `enforcement.check_web_code_is_stamped_by_its_own_sha` (goal K),
// SPLIT: python reads the run archive and computes the fingerprints, this
// judges what they say.
//
// THE THIRD BORROWED-STAMP HOLE, and the same shape as the first two. The
// `.olx` says what the grader is SHOWN; it does not say how the app turns that
// into a SCHEMA or a SCORE. So an edit to the app could change every web
// prompt, or every web score, and leave the recorded columns reading `ok`.
//
// ASK AND SCORE ARE REPORTED SEPARATELY BECAUSE THE REMEDIES DIFFER, and that
// distinction is the whole reason this rule is worth having rather than one
// "stale" flag:
//
//   a changed ASK invalidates the recorded ANSWERS -- the grader was asked a
//     different question, and nothing but a re-sweep can reach it;
//   a changed SCORE leaves the answers standing and only the numbers computed
//     from them in doubt.
//
// AN UNSTAMPED COLUMN IS NOT A PASSING ONE. Columns that predate the stamp
// cannot be dated against the app at all, so they are collected and reported as
// a group: until each is re-stamped by its next sweep, a change to the app's
// schema or scoring code is invisible to them. Silence there would be the
// borrowed stamp all over again.

export type WebStampPayload = {
  /** Set when the fingerprints themselves could not be computed. */
  fingerprintError?: string | null;
  items: Array<{
    item: string;
    /** The stamp the column carries, per item, falling back to corpus-wide. */
    gotAsk?: string | null;
    gotScore?: string | null;
    /** What the app's code fingerprints to NOW, for this item. */
    wantAsk?: string | null;
    wantScore?: string | null;
    /** Declared pairs where a scoring-code change provably changed no number. */
    scoreNeutral?: boolean;
    /** python's archive reading, appended to the score message when present. */
    archiveNote?: string | null;
  }>;
};

export function webCodeStamped(p: WebStampPayload): string[] {
  const out: string[] = [];
  if (p?.fingerprintError) {
    return [`the web-code fingerprint cannot be computed: ${p.fingerprintError}`];
  }
  const unstamped: string[] = [];
  for (const it of p?.items ?? []) {
    if (!it.gotAsk && !it.gotScore) { unstamped.push(it.item); continue; }
    if (it.gotAsk && it.gotAsk !== it.wantAsk) {
      out.push(
        `${it.item}: recorded against app schema code ${it.gotAsk}, now ` +
        `${it.wantAsk}. \`buildSlotSchema\` has changed, so the ANSWERS in ` +
        `this column were given to a different question -- re-sweep; ` +
        `re-scoring cannot reach it`);
    }
    if (it.gotScore && it.gotScore !== it.wantScore && !it.scoreNeutral) {
      out.push(
        `${it.item}: recorded against app scoring code ${it.gotScore}, now ` +
        `${it.wantScore}. The answers still stand; the numbers computed ` +
        `from them may not -- re-sweep.` + (it.archiveNote ?? ''));
    }
  }
  if (unstamped.length) {
    out.push(
      `${unstamped.length} web column(s) predate the app-code stamp and ` +
      `cannot be dated against lo-blocks at all (${unstamped.join(', ')}). ` +
      `Each is re-stamped by its next sweep; until then a change to ` +
      `\`buildSlotSchema\` or \`scoreSlotSheet\` is invisible to them`);
  }
  return out;
}
