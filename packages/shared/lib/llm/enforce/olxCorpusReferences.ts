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
  /**
   * TEACHING-TEXT references the instructor has approved, with the reason.
   *
   * DECLARED PER CELL AND HONOURED ONLY OUTSIDE `<LLMAction>`. The same cell can
   * appear in both places -- `D1/p8` is quoted once on the page and ten times
   * inside the prompt -- and the approval was given for one of those and not the
   * other. A declaration keyed by cell alone would silence both.
   */
  declared?: Array<{ item: string; pid: number; field: string; why: string }>;
};

// THE GRAMMAR IS `corpus_resolve.OLX`'s, NOT A SUBSET OF IT. This stopped at
// `:sha=` and then demanded `}}`, so every reference carrying the optional
// `:alt=` or `:shape=` suffix failed to match and was not counted -- 20 of the
// 63 in the three handouts, including an UNDECLARED one on a page a class
// reads, which is the single case the teaching-ref approval exists to gate.
// The rule's own arithmetic stayed self-consistent throughout (43 matched = 29
// blocking + 14 approved), which is why nothing looked wrong. Keep this in step
// with `corpus_resolve.OLX`; a checker narrower than the grammar it polices
// reports a clean subset as a clean whole.
const REF =
  /\{\{corpus:([A-Za-z0-9]+)\/p(\d+):([A-Za-z0-9_]+):(\d+):(\d+)(?::sha=[0-9a-f]{6,64})?(?::alt=[A-Za-z0-9/,_]+)?(?::shape=[0-9A-Za-z,-]+)?\}\}/g;

/** `<LLMAction>...</LLMAction>` spans: inside is the PROMPT, outside is the PAGE. */
function actionSpans(src: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /<LLMAction\b[\s\S]*?<\/LLMAction>/g;
  for (let m = re.exec(src); m; m = re.exec(src)) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

/**
 * The source with every `<!-- ... -->` blanked to spaces, OFFSETS PRESERVED.
 *
 * Two faults, one cause. A reference inside a comment never renders, so it is
 * neither a reason the page needs `$COURSE_DATA` nor a sentence anybody reads.
 * And a comment that merely MENTIONS `<LLMAction>` -- each handout's header
 * says "EVERY <LLMAction> PROMPT BODY IN THIS FILE IS GENERATED" -- opened a
 * phantom span that ran to the first real `</LLMAction>` and swallowed the
 * page markup in between, so page references were judged to be inside the
 * prompt. That silently voided their teaching-ref approval, which is honoured
 * only outside the prompt: `NR/p1` was declared and counted as blocking
 * anyway. Masking first makes both the span scan and the reference scan read
 * what actually ships; blanking rather than deleting keeps every index valid.
 */
function withoutComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
}

export function olxCorpusReferences(p: CorpusRefPayload): string[] {
  const out: string[] = [];
  const declared = new Map(
    (p?.declared ?? []).map(d => [`${d.item}/p${d.pid}:${d.field}`, d.why]));
  const usedDecl = new Set<string>();
  let approved = 0;
  let blocking = 0;

  for (const f of p?.forms ?? []) {
    if (f.src === null) {
      out.push(`handout ${f.form}: cannot read the .olx (${f.error ?? ''})`);
      continue;
    }
    const src = withoutComments(f.src);
    const spans = actionSpans(src);
    // REPORTED PER REFERENCE, with its cell named, so the readout says WHICH
    // student's words are still load-bearing rather than only how many.
    for (const m of src.matchAll(REF)) {
      const key = `${m[1]}/p${m[2]}:${m[3]}`;
      const at = m.index ?? 0;
      const inPrompt = spans.some(([a, b]) => a <= at && at < b);
      // APPROVED ON THE PAGE, NOT IN THE PROMPT. The instructor's reason --
      // these do not affect how the scorer performs, and the scoring set was
      // chosen partly for teaching -- is about what a CLASS READS. It says
      // nothing about a worked example inside the grader's prompt, and the same
      // cell can be both: `D1/p8` is quoted once on the page and ten times
      // inside it. A declaration keyed by cell alone would silence both.
      if (!inPrompt && declared.has(key)) {
        approved += 1;
        usedDecl.add(key);
        continue;
      }
      blocking += 1;
      out.push(
        `handout ${f.form} still quotes ${m[1]}/p${m[2]} ` +
        `${m[3]} through a corpus reference: the page cannot ` +
        `render without $COURSE_DATA, and a student's sentence is ` +
        `still the worked example. Replace it with an invented ` +
        `one and the reference goes away`);
    }
  }

  // COUNTED, NOT VANISHED. An approved reference still keeps the page dependent
  // on $COURSE_DATA, so the number stays visible even though it does not block
  // -- the same reason a parked finding is still printed.
  if (approved) {
    out.push(
      `${approved} teaching-text corpus reference(s) are DECLARED and not ` +
      `counted: approved as worked examples a class reads. They still keep ` +
      `the page from rendering without $COURSE_DATA`);
  }
  // A DECLARATION THAT MATCHES NOTHING is the next thing to be silenced by it.
  for (const [key, why] of declared) {
    if (!usedDecl.has(key)) {
      out.push(
        `OLX_TEACHING_REFS declares ${key} ("${why.slice(0, 40)}...") and no ` +
        `teaching-text reference quotes it any more -- drop the entry`);
    }
  }

  if (blocking > p.budget) {
    out.push(
      `OLX corpus references: ${blocking} against a budget of ` +
      `${p.budget}. The budget ratchets DOWN -- lower it ` +
      `when one is retired, never raise it to fit a new one`);
  } else if (blocking < p.budget) {
    out.push(
      `OLX corpus references: ${blocking}, BELOW the budget of ` +
      `${p.budget} -- lower OLX_CORPUS_REF_BUDGET to ` +
      `${blocking} so the ground gained is held`);
  }
  return out;
}
