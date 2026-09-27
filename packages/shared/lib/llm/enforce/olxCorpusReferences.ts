// Which served .olx still cannot render without the student corpus?
//
// Ported from `enforcement.check_olx_corpus_references` (goal K).
//
// THE MECHANISM IS A CONCESSION, NOT A SOLUTION, and this check exists to keep
// saying so. A `{{corpus:...}}` reference takes a student's sentence out of the
// repo -- which is the point -- but it leaves the handout DEPENDENT on
// `$COURSE_DATA` to render at all, and it leaves the sentence itself still
// being shown to whoever reads the page. It buys privacy in the repository and
// buys nothing about whether a real answer should be the worked example in the
// first place.
//
// THE BUDGET RATCHETS DOWN ONLY. A reference removed is progress and must not
// be spendable on a new one somewhere else -- so being BELOW the budget is also
// reported, as an instruction to lower it and hold the ground gained.

export type CorpusRefPayload = {
  /**
   * Each handout's form number and its .olx source.
   *
   * `error` CARRIES THE READ FAILURE'S OWN WORDS. python interpolates the
   * exception -- `cannot read the .olx ({exc})` -- so a payload that only said
   * "null" would produce a finding two-thirds the length of python's and
   * indistinguishable, in a baseline diff, from a new fault.
   */
  forms: Array<{ form: number | string; src: string | null; error?: string | null }>;
  budget: number;
};

const REF = /\{\{corpus:([A-Za-z0-9]+)\/p(\d+):([A-Za-z0-9_]+):(\d+):(\d+)(?::sha=[0-9a-f]+)?\}\}/g;

export function olxCorpusReferences(p: CorpusRefPayload): string[] {
  const out: string[] = [];
  for (const f of p?.forms ?? []) {
    if (f.src === null) {
      out.push(`handout ${f.form}: cannot read the .olx (${f.error ?? ''})`);
      continue;
    }
    // REPORTED PER REFERENCE, with its cell named, so the readout says WHICH
    // student's words are still load-bearing rather than only how many.
    for (const m of f.src.matchAll(REF)) {
      out.push(
        `handout ${f.form} still quotes ${m[1]}/p${m[2]} ` +
        `${m[3]} through a corpus reference: the page cannot ` +
        `render without $COURSE_DATA, and a student's sentence is ` +
        `still the worked example. Replace it with an invented ` +
        `one and the reference goes away`);
    }
  }
  if (out.length > p.budget) {
    out.push(
      `OLX corpus references: ${out.length} against a budget of ` +
      `${p.budget}. The budget ratchets DOWN -- lower it ` +
      `when one is retired, never raise it to fit a new one`);
  } else if (out.length < p.budget) {
    out.push(
      `OLX corpus references: ${out.length}, BELOW the budget of ` +
      `${p.budget} -- lower OLX_CORPUS_REF_BUDGET to ` +
      `${out.length} so the ground gained is held`);
  }
  return out;
}
