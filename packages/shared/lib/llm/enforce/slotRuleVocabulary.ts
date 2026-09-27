// Does a slot's `rule` name a verdict that slot cannot emit?
//
// Ported from `enforcement.check_slot_rules_are_vocabulary_neutral` (goal K).
//
// The rule text is rendered into BOTH prompts, so a rule naming a literal
// verdict gives one side an instruction about a token it cannot produce. The
// fix each one wants is `{fail}`, which each generator fills with its own
// vocabulary.
//
// THE INCIDENT: a note in the live web prompt named `not_reason`, a token from
// the rubric's vocabulary, while its sheet offered `wrong_kind`. Every test in
// that note was inert, and it dated to the original import.
//
// BOTH SIDES HAVE TO OFFER IT. `offered_paper` is the slot's own verdicts plus
// its codes plus the defaults plus anything a `<Cover>` group adds; `offered_web`
// is what the SHEET offers, and `null` there means the sheet could not be read
// for this slot -- which is not the same as offering nothing, so it does not
// convict.

export type VocabRuleSlot = {
  form: number | string;
  item: string;
  what: string;
  rule: string;
  /** The paper vocabulary for this slot: verdicts + codes + defaults + cover. */
  offeredPaper: string[];
  /** What the SHEET offers, or null when it could not be read. */
  offeredWeb: string[] | null;
};

/** Python's `str(sorted(xs))` -- `['a', 'b']`, with the space. */
function pyList(xs: string[]): string {
  return `[${xs.map(s => `'${s.replace(/'/g, "\\'")}'`).join(', ')}]`;
}

export function slotRulesAreVocabularyNeutral(
    p: { slots: VocabRuleSlot[]; known: string[] }): string[] {
  const known = p?.known ?? [];
  const out: string[] = [];
  for (const s of p?.slots ?? []) {
    if (!s.rule) continue;
    const paper = new Set(s.offeredPaper ?? []);
    const web = s.offeredWeb === null ? null : new Set(s.offeredWeb);
    // NAMED LITERALLY, in backticks -- the form a generator does not touch.
    const named = [...new Set(known.filter(v => s.rule.includes(`\`${v}\``)))].sort();
    const bad = named.filter(
      v => !paper.has(v) || (web !== null && !web.has(v)));
    if (bad.length) {
      out.push(
        `H${s.form} ${s.item}.${s.what}: \`rule\` names the verdict ` +
        `${pyList(bad)} literally, and this SLOT does not offer it on both ` +
        `sides -- web ${web === null ? 'n/a' : pyList([...web].sort())}, ` +
        `paper ${pyList([...paper].sort())}. The rule is rendered into ` +
        `both prompts, so one side gets an instruction about a ` +
        `token it cannot emit. Use \`{fail}\`, which each generator ` +
        `fills with its own verdict`);
    }
  }
  return out;
}
