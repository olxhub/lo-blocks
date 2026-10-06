// Do the app and the harness offer the SAME verdict list, slot by slot?
//
// Ported from `enforcement.check_engines_offer_the_same_verdicts` (goal K),
// SPLIT: python resolves each engine's slot list through ITS OWN reader, and
// this judges the pair.
//
// FOUND BY CAPTURING WHAT EACH ENGINE ACTUALLY SENDS, and invisible to every
// instrument that existed. The three that look like they cover it do not: one
// compares the BODY TEXT, one compares which RUBRIC ELEMENTS appear, and one
// compares property names and order against a regex reading of the schema
// builder's source. A verdict enum is built from RUNTIME SLOT DATA and appears
// in none of those, so all three were clean while the two engines were asking
// the grader different questions.
//
// ONLY WHAT THE GRADER IS ASKED. A COMPUTED slot -- an `equals`, `maps`,
// `derived`, `expect` or `forbid` target -- is excluded from both sides'
// response schemas, so the two sheets can declare different verdict lists for
// it and no grader will ever see either. Measured against the real captured
// requests: of 76 slots where the declarations differ, 19 are computed and
// absent from the app's schema; the other 57 are genuinely offered, 13 of them
// on slots that carry points. Reporting the 19 would be claiming a difference
// in a question nobody is asked -- so they are COUNTED AND REPORTED AS A COUNT,
// which is not the same as dropping them.

export type VerdictParityPayload = {
  items: Array<{
    item: string;
    /** python's message when a side could not be resolved at all. */
    error?: string | null;
    /** slot key -> the verdicts the APP offers. */
    app: Record<string, string[]>;
    /** slot key -> the verdicts the HARNESS offers. */
    harness: Record<string, string[]>;
    /** Slot keys excluded from both response schemas: computed, never asked. */
    excluded: string[];
  }>;
};

const pyList = (xs: string[]): string =>
  '[' + xs.map(x => `'${x}'`).join(', ') + ']';

export function enginesOfferSameVerdicts(p: VerdictParityPayload): string[] {
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    if (it.error) {
      out.push(`${it.item}: cannot compare verdict lists: ${it.error}`);
      continue;
    }
    const app = it.app ?? {};
    const harness = it.harness ?? {};
    const excluded = new Set(it.excluded ?? []);
    let silent = 0;
    for (const key of Object.keys(app).filter(k => k in harness).sort()) {
      const a = app[key] ?? [];
      const h = harness[key] ?? [];
      if (JSON.stringify(a) === JSON.stringify(h)) continue;
      if (excluded.has(key)) { silent += 1; continue; }
      out.push(
        `${it.item}.${key}: the app offers ${pyList(a)} and the harness offers ${pyList(h)}. ` +
        `The two engines are asking the grader a different question, ` +
        `so their answers are not comparable on this slot -- and a ` +
        `verdict only one side can say is one only that side can be ` +
        `charged for`);
    }
    if (silent) {
      out.push(
        `${it.item}: ${silent} computed slot(s) also declare different ` +
        `verdict lists on the two sides. No grader is asked them, so ` +
        `nothing can answer differently -- recorded rather than ` +
        `reported as a divergence, so the count is not silently lost`);
    }
  }
  return out;
}
