// `{fail}` rendering into a different verdict on the two engines.
//
// Ported from `enforcement.check_rule_fail_tokens_agree` (goal K).
//
// ONE RULE, TWO PROMPTS, AND THE TOKEN IS THE JOIN. `{fail}` is what a rule
// says to call a slot that does not hold. If the web fills it with a
// content verdict and paper fills it with `absent`, one grader is being told
// the box was left EMPTY and the other that its content is WRONG -- the same
// rule firing on different evidence, which is a difference in the question
// rather than in the answer.
//
// AND THE PAPER RENDERING MUST BE A VERDICT THAT SLOT OFFERS THERE. A `rule`
// that renders a token the paper sheet does not offer asks for a judgement the
// grader has no way to express.

export type RuleFailTokensPayload = {
  slots: Array<{
    /** `H<n> <item>.<slot>`, as the finding names it. */
    where: string;
    /** What `{fail}` becomes in the web prompt. */
    web: string;
    /** What `{fail}` becomes in the paper prompt. */
    paper: string;
    /** The verdicts that slot offers on the paper side. */
    rubricVocab: string[];
  }>;
};

export function ruleFailTokensAgree(p: RuleFailTokensPayload): string[] {
  const out: string[] = [];
  for (const s of p.slots ?? []) {
    if (!(s.rubricVocab ?? []).includes(s.paper)) {
      out.push(
        `${s.where}: \`rule\` renders ${pyRepr(s.paper)} into the paper prompt, ` +
        `which is not a verdict that slot offers there`);
    }
    // ONLY WHEN ONE SIDE SAYS `absent`. Two different CONTENT verdicts are a
    // vocabulary difference the sheets already declare; `absent` against a
    // content verdict is the two graders being asked about different evidence.
    if ((s.web === 'absent' || s.paper === 'absent') && s.web !== s.paper) {
      out.push(
        `${s.where}: \`{fail}\` becomes ${pyRepr(s.web)} on the web and ` +
        `${pyRepr(s.paper)} on paper. One side is being told the box was left ` +
        `empty and the other that its content is wrong — the same rule, firing ` +
        `on different evidence`);
    }
  }
  return out;
}

function pyRepr(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/'/g, "\\'")}'`;
}
