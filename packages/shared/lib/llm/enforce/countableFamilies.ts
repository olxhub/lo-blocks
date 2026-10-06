// Do items with the SAME repeated-slot shape use the same primitive?
//
// Ported from `enforcement.check_countable_families_converted` (goal K).
// Generic by the project's own test: "interchangeable slots sharing one code
// are a COUNT, and a count cannot say which of several codes applies" is a
// statement about rubric authoring, not about any subject. The items, the codes
// and the exemptions all arrive as data.
//
// THE FAILURE IT EXISTS FOR. `primitives.json` says what each primitive IS;
// nothing said which items should use one. So `counts` landed on one item and
// not on its twin -- the same shape with a different noun, the same three
// interchangeable slots, the same single code -- and no audit noticed for as
// long as it took someone to ask.
//
// BOTH DIRECTIONS, and the second is the dangerous one: a `counts` rule over
// members carrying MORE than one code silently retires all but one, which is
// the shape that has already retired live codes once.

export type CountableItem = {
  id: string;
  deriveFromCredit?: boolean;
  /** Slot keys some `Counts` group covers. */
  counted: string[];
  credit: Array<{ what: string; codes?: Record<string, string> }>;
};

export type CountableFamiliesPayload = {
  items: CountableItem[];
  /** `[item, stem]` pairs declared not-to-convert, with reasons elsewhere. */
  exempt: Array<[string, string]>;
};

export function countableFamiliesConverted(p: CountableFamiliesPayload): string[] {
  const problems: string[] = [];
  const exempt = new Set((p?.exempt ?? []).map(e => `${e[0]} ${e[1]}`));
  for (const it of p?.items ?? []) {
    if (!it.deriveFromCredit) continue;
    const counted = new Set(it.counted ?? []);
    // NON-GREEDY, like python's `(.+?)_(\d+)$`: a stem may itself contain an
    // underscore, and a greedy head would split `antecedent_kind_1` after
    // `kind` and make two families of one.
    const fams = new Map<string, Array<{ what: string; codes?: Record<string, string> }>>();
    for (const c of it.credit ?? []) {
      const m = /^(.+?)_(\d+)$/.exec(c.what);
      if (!m) continue;
      if (!fams.has(m[1])) fams.set(m[1], []);
      fams.get(m[1])!.push(c);
    }
    for (const [stem, members] of fams) {
      if (members.length < 2) continue;
      const codes = new Set<string>();
      for (const c of members) for (const v of Object.values(c.codes ?? {})) codes.add(v);
      const covered = members.every(c => counted.has(c.what));
      const isExempt = exempt.has(`${it.id} ${stem}`);
      if (codes.size === 1 && !covered) {
        if (isExempt) continue;
        const only = [...codes][0];
        problems.push(
          `${it.id}: \`${stem}_*\` is ${members.length} interchangeable slots ` +
          `sharing one code (${only}), so the model is asked for ` +
          `${members.length} judgements where a count would do. Convert it to ` +
          `\`counts\`, or add (${it.id}, ${stem}) to COUNTABLE_EXEMPT with ` +
          `the reason`);
      }
      if (codes.size > 1 && covered) {
        problems.push(
          `${it.id}: \`${stem}_*\` is counted, but its slots carry ` +
          `${codes.size} codes (${[...codes].sort().join(', ')}). A count cannot ` +
          `express which one applies, so converting it retires all but one`);
      }
      if (isExempt && covered) {
        problems.push(
          `${it.id}: \`${stem}_*\` is in COUNTABLE_EXEMPT and also counted \u2014 ` +
          `the exemption is stale, remove it`);
      }
    }
  }
  return problems;
}
