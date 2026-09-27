// Does every rubric slot have an entry in its item's `slots=` list?
//
// Ported from `enforcement.check_rubric_slots_reach_the_sheet` (goal K, E48).
//
// THE GENERATOR OWNS THE PROSE; THE SHEET OWNS THE SLOT LIST. `GENERATED_ATTRS`
// covers the attributes the rubric fully determines and deliberately leaves
// `slots=` authored, because it carries four things the rubric has no field
// for: a grader-facing LABEL, the `!` gate marker, an `@` points override, and
// the `pick(group)` binding. Neither file is derivable from the other, so the
// boundary is right -- what was missing is the assertion that they AGREE.
//
// MEASURED, AND IT COST A SWEEP. A slot added to the rubric never reached
// `slots=`; the sweep ran, spent ~240 calls, and recorded the item against a
// prompt with a dangling reference, its targets moving incoherently because a
// rule asked for an answer that did not exist.
//
// THE SWEEP'S OWN GUARD WAS TOO WEAK AND IS THE LESSON. It asserted the slot
// name appeared in the .olx at all, which PASSED -- on the two prose mentions
// the generator had just written. Presence in the FILE is not presence in the
// SLOT LIST, and a guard that cannot tell them apart certifies the fault it
// exists to stop.

export type ReachItem = {
  id: string;
  /** Keys the sheet's `slots=` declares. */
  have: string[];
  credit: Array<{ what: string; verdicts: string[] }>;
};

/**
 * The web check corresponding to a rubric key, or null if unmatched.
 *
 * AN EXPLICIT ALIAS WINS OVER THE IDENTITY MATCH, and an alias entry is
 * AUTHORITATIVE: falling through to identity when none of its candidates is
 * present would quietly re-admit the same-name match the alias exists to
 * override. A key that legitimately matches itself says so by listing itself.
 */
export function webName(key: string, have: Set<string>,
                        alias: Record<string, string[]>): string | null {
  const a = alias[key];
  if (a !== undefined) {
    for (const cand of a) if (have.has(cand)) return cand;
    return null;
  }
  return have.has(key) ? key : null;
}

export function rubricSlotsReachTheSheet(
    p: { items: ReachItem[]; alias: Record<string, string[]> }): string[] {
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    const have = new Set(it.have ?? []);
    if (!have.size) continue;
    for (const c of it.credit ?? []) {
      const key = c.what;
      if (!key || have.has(key)) continue;
      if (!(c.verdicts ?? []).length) continue;
      if (webName(key, have, p.alias ?? {})) continue;
      out.push(
        `${it.id}/${key} is a rubric slot with NO entry in the sheet's ` +
        `\`slots=\` list, so the grader is never asked to answer it. Any ` +
        `rule naming it -- and the generator will write those rules into ` +
        `the prompt -- points at an answer that cannot exist. Add it to ` +
        `\`slots=\` (with its label, and a \`pick(group)\` if it takes one), ` +
        `or remove it from the rubric`);
    }
  }
  return out;
}
