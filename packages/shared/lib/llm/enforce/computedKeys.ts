// Two computed rules writing the SAME check: the second silently wins.
//
// Ported from `enforcement.check_computed_rules_do_not_share_a_key` (goal K).
//
// Both engines compute `forbid` and `expect` in a loop that ASSIGNS the check —
// `checks[rule.key] = ...` in `agreement.apply_computed`, `slots[rule.key] = ...`
// in `score.derive_ledger`. So two rules on one key are not an OR, which is how
// anyone would read them; the last one decides and the first is dead.
//
// Neither side is wrong about it, so it is not a divergence — it is a trap. It
// was found while designing a disjunction for Q4b's INSTEAD-OF test, which
// needed exactly that OR and would silently have got "whichever rule I wrote
// last". Nothing authors a duplicate today; this makes the day someone does an
// audit failure rather than a wrong number.

/** One rubric item's computed rules, by primitive, as keys in authored order. */
export type ComputedItem = {
  handout: number;
  id: string;
  kinds: Record<string, (string | null)[]>;
};

// The primitives whose rules ASSIGN rather than accumulate. A primitive added
// to the engines without being added here is unwatched, which is why the list
// is named rather than derived from whatever the payload happens to carry.
const ASSIGNING = ['forbid', 'expect', 'equals', 'derived'];

export function computedRulesDoNotShareAKey(
  p: { items: ComputedItem[] },
): string[] {
  const out: string[] = [];
  for (const item of p?.items ?? []) {
    for (const kind of ASSIGNING) {
      const counts = new Map<string, number>();
      for (const key of item.kinds?.[kind] ?? []) {
        if (key == null) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, n] of counts) {
        if (n < 2) continue;
        out.push(
          `H${item.handout} ${item.id}: ${n} \`${kind}\` rules write \`${key}\`. ` +
          `Both engines ASSIGN the computed check per rule, so the last one ` +
          `wins and the others are dead -- they do NOT combine as an OR. ` +
          `Express the disjunction as one rule over a single operand, or ` +
          `extend the primitive deliberately on both sides`);
      }
    }
  }
  return out;
}
