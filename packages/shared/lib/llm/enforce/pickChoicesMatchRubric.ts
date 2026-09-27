// Does a `pick()` slot's menu in the .olx match what the rubric declares?
//
// Ported from `enforcement.check_pick_choices_match_rubric` (goal K).
//
// The grader answers the SHEET, so a menu that has drifted from the rubric is a
// question the grader cannot answer correctly -- it is not offered the option
// the design says exists.
//
// NULL IS NOT AN EMPTY MENU. A slot with no rubric source at all -- `named_type`
// and `observed_type`, twelve slot-instances across the cadence items, whose
// sets live only in the .olx -- is PRESERVED, not reported. Reading "not
// declared" as "declared empty" would delete them from the attribute and break
// every cadence item, which is the same None/[] conflation that produced
// phantom stale cells elsewhere.

export type PickEntry = {
  item: string;
  slot: string;
  setName: string;
  /** What the RUBRIC declares, or null when it declares nothing. */
  want: string[] | null;
  /** What the .olx `choices=` offers for that set. */
  have: string[];
};

/** Python's `str(sorted(xs))` -- `['a', 'b']`, with the space. */
function pyList(xs: string[]): string {
  return `[${xs.map(s => `'${s.replace(/'/g, "\\'")}'`).join(', ')}]`;
}

export function pickChoicesMatchRubric(p: { entries: PickEntry[] }): string[] {
  const out: string[] = [];
  for (const e of p?.entries ?? []) {
    if (e.want === null) continue;          // no rubric source: preserved
    const want = [...e.want].sort();
    const have = [...(e.have ?? [])].sort();
    if (JSON.stringify(want) !== JSON.stringify(have)) {
      out.push(
        `${e.item}/${e.slot} picks from '${e.setName}': the rubric declares ` +
        `${pyList(want)} but the .olx offers ${pyList(have)}. The ` +
        `grader cannot answer what it is not offered -- run ` +
        `\`npm run build:assemble-prompts -- --write\` and confirm the checklist head ` +
        `lists it.`);
    }
  }
  return out;
}
