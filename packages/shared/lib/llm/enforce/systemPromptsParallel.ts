// Two hand-maintained system prompts, rule by rule.
//
// Ported from `enforcement.check_system_prompts_are_parallel` (goal K),
// SPLIT: python holds the two prompts, TypeScript judges them.
//
// WHY IT IS A SPLIT AND NOT A MOVE. One of the two prompts is
// `score.SYSTEM_TMPL` -- the paper scorer's, a python constant -- so python is
// one of the voices being compared and must stay. What is generic is the
// JUDGEMENT, and it is three statements about any pair of parallel prompts:
//
//   a rule ONE side is told and the other is not is a finding, unless declared;
//   a rule that DIFFERS is a finding, unless declared;
//   a DECLARATION that the two must differ, where they now agree, is stale --
//     "retire the entry, or the table stops meaning anything".
//
// The third is the half that rots silently, and it is the reason the other two
// are worth having: a divergence table nobody retires from turns every real
// difference into a declared one.
//
// NUMBERED RULES ARE THE UNIT, parsed on the python side with the prompts. The
// pairing is by NUMBER, not by position or by text similarity: a rule inserted
// on one side would otherwise re-pair every rule after it and report the whole
// tail as divergent.

export type SystemPromptsPayload = {
  /** rule number -> its text, whitespace-collapsed. */
  web: Record<string, string>;
  paper: Record<string, string>;
  /** rule number -> the mechanism that FORCES the difference. */
  declared: Record<string, string>;
};

export function systemPromptsParallel(p: SystemPromptsPayload): string[] {
  const problems: string[] = [];
  const web = p?.web ?? {};
  const paper = p?.paper ?? {};
  const declared = p?.declared ?? {};
  const nums = [...new Set([...Object.keys(web), ...Object.keys(paper)])]
    .sort((a, b) => Number(a) - Number(b));

  for (const n of nums) {
    const w = web[n];
    const pa = paper[n];
    const isDeclared = n in declared;
    if (w === undefined || pa === undefined) {
      if (!isDeclared) {
        problems.push(
          `system prompt rule ${n} exists only on ${pa === undefined ? 'the web' : 'the paper side'} ` +
          `-- a rule one scorer is told and the other is not. Add it to ` +
          `the other prompt, or declare it in ` +
          `SYSTEM_PROMPT_DIVERGENCES with the mechanism that forces it`);
      }
      continue;
    }
    if (w === pa) {
      if (isDeclared) {
        problems.push(
          `SYSTEM_PROMPT_DIVERGENCES declares rule ${n} must differ ` +
          `("${declared[n].slice(0, 60)}...") but the two ` +
          `prompts now say it identically -- retire the entry, or the ` +
          `table stops meaning anything`);
      }
      continue;
    }
    if (!isDeclared) {
      problems.push(
        `system prompt rule ${n} DIFFERS between the two scorers and is ` +
        `not declared.\n      web  : ${w.slice(0, 110)}\n      paper: ${pa.slice(0, 110)}\n` +
        `      If the difference is forced by the output shape, declare ` +
        `it in SYSTEM_PROMPT_DIVERGENCES; if not, make them agree`);
    }
  }
  return problems;
}
