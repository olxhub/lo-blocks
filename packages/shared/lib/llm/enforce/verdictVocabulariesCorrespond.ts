// Can each engine express every failing verdict the other can?
//
// Ported from `enforcement.check_verdict_vocabularies_correspond` (goal K).
//
// WHAT THIS IS NOT, because the obvious version is 48 false positives. A
// `codes` key the prompt never offers is NOT a dead code, and a prompt verdict
// with no `codes` entry is NOT unmapped: the two engines have DIFFERENT verdict
// vocabularies ON PURPOSE, and `codes` IS the paper vocabulary. Scanning for
// equality reports 22 "dead codes" and 26 "unmapped verdicts" that are all by
// design -- measured before the check was written, which is why it is written
// against a DECLARED PAIRING instead.
//
// WHAT IT IS: every failing verdict on each side must have a counterpart on the
// other, via `VERDICT_PAIRS`, with hedges exempt. A web verdict with no paper
// counterpart is a charge the paper scorer CANNOT EXPRESS -- the shape that
// once told `score.py` to answer `wrong_kind` while offering it
// met/absent/not_active, so every test was inert and it credited a box both
// other engines reject.

export type VocabSlot = {
  what: string;
  /** The paper vocabulary: verdict -> deduction code. */
  codes: Record<string, string>;
  /** What the WEB offers for this slot, `resolveOptions` already applied. */
  opts: string[];
};

export type VocabPayload = {
  items: Array<{ id: string; slots: VocabSlot[] }>;
  /** `item/slot` -> {web verdict: paper verdict}. */
  pairs: Record<string, Record<string, string>>;
  hedges: string[];
};

/** Python's `str(a_list_of_strings)` -- `['a', 'b']`, with the space. */
function pyList(xs: string[]): string {
  return `[${xs.map(s => `'${s.replace(/'/g, "\\'")}'`).join(', ')}]`;
}

export function verdictVocabulariesCorrespond(p: VocabPayload): string[] {
  const hedges = new Set(p?.hedges ?? []);
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    for (const c of it.slots ?? []) {
      const codes = c.codes ?? {};
      const opts = (c.opts ?? []).filter(Boolean);
      if (!Object.keys(codes).length || !opts.length) continue;
      const key = `${it.id}/${c.what}`;
      // `opts[1:]` -- THE FIRST OPTION IS THE PASSING ONE. Only the failing
      // verdicts need a counterpart; pairing `met` with anything is noise.
      const web = opts.slice(1).filter(o => !hedges.has(o));
      const paper = Object.keys(codes).sort().filter(k => !hedges.has(k));
      const pairs = p.pairs?.[key];
      if (pairs === undefined) {
        out.push(
          `${key} has no entry in VERDICT_PAIRS: the web offers ` +
          `${pyList(web)} and the paper vocabulary is ${pyList(paper)}, and nothing ` +
          `declares which corresponds to which. Author the pairing.`);
        continue;
      }
      for (const w of web) {
        if (!(w in pairs)) {
          out.push(
            `${key}: the web can answer \`${w}\` and NOTHING ON THE ` +
            `PAPER SIDE corresponds -- a charge score.py cannot ` +
            `express. Web ${pyList(web)}, paper ${pyList(paper)}.`);
        }
      }
      const mapped = new Set(Object.values(pairs));
      for (const pp of paper) {
        if (!mapped.has(pp)) {
          out.push(
            `${key}: the paper vocabulary has \`${pp}\` and no web ` +
            `verdict maps to it -- a charge the app cannot ` +
            `produce. Web ${pyList(web)}, paper ${pyList(paper)}.`);
        }
      }
    }
  }
  return out;
}
