// A prose-only rule marked CONVERTIBLE that no subgoal names.
//
// Ported from `enforcement.check_convertible_prose_rules_have_subgoals` (goal K).
//
// CONVERTIBLE IS A CLAIM THAT WORK IS OWED. Marking a rule convertible and
// never opening a subgoal for it leaves the claim standing indefinitely: the
// table says the rule COULD be expressed as a primitive, nobody is doing it,
// and nothing reports the gap because the label itself looks like progress.
//
// EITHER IS AN ANSWER. Open the subgoal, or change the reason to argue why the
// rule cannot convert -- what is not an answer is the label alone.

export type ConvertibleProsePayload = {
  /** The composed goal ledger, where a subgoal would name the slot. */
  goalsText: string | null;
  /** Why the ledger could not be read, if it could not. */
  goalsError?: string | null;
  /** `PROSE_ONLY_SLOTS`, already sorted as python sorts it. */
  slots: Array<{ item: string; slot: string; why: string }>;
};

export function convertibleProseHasSubgoal(p: ConvertibleProsePayload): string[] {
  if (p.goalsText === null || p.goalsText === undefined) {
    return [`GOALS.md cannot be read, so CONVERTIBLE prose rules cannot be ` +
            `checked: ${p.goalsError ?? 'unreadable'}`];
  }
  const text = p.goalsText;
  const out: string[] = [];
  for (const { item, slot, why } of p.slots ?? []) {
    if (!why.includes('CONVERTIBLE')) continue;
    if (why.trimStart().startsWith('NOT CONVERTIBLE')) continue;
    // NAMED EITHER WAY: `item.slot` outright, or the slot in backticks with the
    // item mentioned anywhere -- a subgoal writes it both ways.
    const named = text.includes(`${item}.${slot}`) ||
                  (text.includes(`\`${slot}\``) && text.includes(item));
    if (named) continue;
    out.push(
      `PROSE_ONLY_SLOTS marks ${item}.${slot} CONVERTIBLE but no subgoal in ` +
      `GOALS.md names it. A convertible rule is work, not a label: add it as a ` +
      `subgoal under the equivalence goal, or change the reason to argue why it ` +
      `cannot convert`);
  }
  return out;
}
