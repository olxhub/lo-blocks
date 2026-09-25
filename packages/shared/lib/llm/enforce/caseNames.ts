// Does any shipped prompt NAME a member of the cohort it was tuned on?
//
// Ported from `enforcement.check_no_case_names_in_prompts` (goal K, subgoal
// E50). The rule lives here, in the package that also assembles the prompt, so
// that the thing being judged and the judgement of it stop being two
// repositories apart.
//
// WHY IT MATTERS MORE THAN IT LOOKS. A rule that names p10 is not merely
// untidy: it is evidence the rule was written against one cell, which is the
// failure this project has measured over and over — ten reverted wordings on
// Q6, three on Q2's inversion boundary, each one a clause aimed at a cell its
// author could see. A case name in the prompt is that habit reaching the
// student-facing side.
//
// NOT THE SAME AS LEAKAGE. `leakage.py` asks whether a rule echoes the cohort's
// WORDS. This asks whether it names a cohort MEMBER. A rule can be free of
// every borrowed phrase and still say "unlike p10".

/** One prompt as it ships: the item that owns it and the text a grader reads. */
export type ShippedPrompt = { item: string; text: string };

// THE PYTHON REGEX, CHARACTER FOR CHARACTER, and the two details are the whole
// rule. `(?<![\w/])` rather than `\b` excludes the `p10` inside a corpus
// reference path like `Q1/p10:response:...` — those are the RESOLVER's
// addresses, not prose naming a case, and a `\b` port reports all of them.
// `\d{1,2}` rather than `{1,3}` because the cohort is p1..p20; widening it is
// how a port quietly becomes a different check.
const CASE_NAME = /(?<![\w/])p\d{1,2}\b/g;

/**
 * Every cohort case named by a shipped prompt, item by item.
 *
 * Returns FINDINGS, not a boolean, because the caller reports them and a count
 * cannot say which item or which case. An empty array is the passing answer.
 */
export function caseNamesInPrompts(prompts: ShippedPrompt[]): string[] {
  const out: string[] = [];
  for (const { item, text } of prompts) {
    const hits = [...new Set(String(text ?? '').match(CASE_NAME) ?? [])].sort();
    if (!hits.length) continue;
    // Rendered as Python renders a list of strings, because this message is the
    // finding the audit prints and a ported check that changes the wording of a
    // finding is indistinguishable, in a baseline diff, from a new fault.
    const rendered = `[${hits.map(h => `'${h}'`).join(', ')}]`;
    out.push(
      `${item}: the shipped prompt names cohort case(s) ${rendered}. A rule ` +
      `that names a case is a rule tuned to that case, and the grader is ` +
      `being shown it. State the DISTINCTION the cell taught instead of the ` +
      `cell -- the evidence belongs in GOALS.md, not in the prompt`);
  }
  return out;
}
