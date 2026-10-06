// Does a JUDGING field tell the grader what a verdict COSTS?
//
// Ported from `enforcement.check_no_judging_field_states_what_a_verdict_costs`
// (goal K). Generic: arithmetic belongs in the derivation or a comment, not in
// a prompt whose job is to return judgements -- THE MODEL EXECUTES IT
// (subgoal Q41). The fields and their prose arrive as data.

export type JudgingField = {
  item: string;
  what: string;
  field: 'desc' | 'rule';
  text: string;
};

export type VerdictCostsPayload = { fields: JudgingField[] };

// PYTHON'S PATTERN, ALTERNATIVE FOR ALTERNATIVE. `worth \d(?! of)` needs the
// negative lookahead: "worth 2 of 5" is describing the SCALE, not charging a
// verdict, and without it every max statement reads as a cost.
const PAT = new RegExp(
  'cannot count|stands INSTEAD|never alongside|reason deductions|' +
  'costs the whole item|the whole item is that finding|zeroes the item|' +
  'is charged \\d|worth \\d(?! of)', 'gi');

export function noJudgingFieldStatesCost(p: VerdictCostsPayload): string[] {
  const out: string[] = [];
  for (const f of p?.fields ?? []) {
    if (!f.text) continue;
    PAT.lastIndex = 0;
    const hits = [...new Set([...String(f.text).matchAll(PAT)]
      .map(m => m[0].toLowerCase()))].sort();
    if (!hits.length) continue;
    out.push(
      `${f.item}/${f.what}/${f.field} tells a JUDGING ` +
      `grader what a verdict COSTS: [${hits.map(h => `'${h}'`).join(', ')}]. Arithmetic ` +
      `belongs in the derivation or a comment, not in a ` +
      `prompt whose job is to return judgements -- the ` +
      `model executes it (subgoal Q41).`);
  }
  return out;
}
