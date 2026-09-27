// Can the grader answer a verdict the slot's MAPS cannot act on?
//
// Ported from `enforcement.check_mapped_slots_have_no_unreachable_verdict`
// (goal K). Python fetches -- the slot, what the SHEET offers, what the map
// emits, the deduction codes -- and the judgement lives here.
//
// THE SHEET IS THE AUTHORITY ON WHAT THE GRADER MAY ANSWER, not the rubric, and
// that distinction is the whole check. Subgoal E52: this once read the RUBRIC's
// verdict list, and the hole let the exact fault it was built for survive a
// whole sweep. On 2026-09-06 `unclear` was dropped from Q2's rubric list, the
// check went clean, and the SHEET still declared
// `wgb_inverts_utb:...:unclear@2` -- so the grader kept answering it. Five
// divergences, at an IDENTICAL prompt_sha, with the audit reporting nothing. A
// check that reads the side the grader does not see is checking the wrong
// document. The caller therefore passes `offered` (the sheet's) and falls back
// to the rubric's list only when the sheet says nothing.
//
// A DECLARED COUNTERPART IS NOT AN ORPHAN. The two engines' verdict
// vocabularies differ BY DESIGN and every pair is recorded: Q4a's sheet offers
// `wrong_kind` where its map emits `not_antecedent`, and the engines charge at
// nearly the same rate (39 against 44 over the same runs) -- they agree on the
// judgement and differ on the name. Without this expansion the comparison
// reports 39 mismatches of which about 37 are the design.

export type MappedSlot = {
  item: string;
  key: string;
  /** The `pick` the map reads. */
  pick: string;
  /** What the SHEET offers, or null when the sheet spells nothing out. */
  offered: string[] | null;
  /** The RUBRIC's list, used only when `offered` is null. */
  rubricVerdicts?: string[];
  /** What the map can emit. */
  emits: string[];
  /** verdict -> deduction code. */
  codes?: Record<string, string>;
};

export type MappedVerdictsPayload = {
  slots: MappedSlot[];
  /** Declared counterpart shapes, each `[web, paper]`, IN TABLE ORDER. */
  divergences: Array<[string[], string[]]>;
};

/** Python's `sorted(list_of_str)` rendering. */
const pyList = (xs: Iterable<string>) =>
  `[${[...new Set(xs)].sort().map(x => `'${x}'`).join(', ')}]`;

export function mappedSlotsHaveNoUnreachableVerdict(p: MappedVerdictsPayload): string[] {
  const out: string[] = [];
  for (const slot of p?.slots ?? []) {
    const emitsBase = new Set(slot.emits ?? []);
    // ONE PASS, IN TABLE ORDER, exactly as python walks the dict. Each side
    // pulls in the other, and the two `if`s are evaluated in sequence on the
    // SAME set, so a shape can chain into one the previous line just added.
    let emits = new Set(emitsBase);
    for (const [web, paper] of p?.divergences ?? []) {
      if ((paper ?? []).some(v => emits.has(v))) {
        for (const v of web ?? []) emits.add(v);
      }
      if ((web ?? []).some(v => emits.has(v))) {
        for (const v of paper ?? []) emits.add(v);
      }
    }
    const answerable = slot.offered !== null && slot.offered !== undefined
      ? new Set(slot.offered)
      : new Set(slot.rubricVerdicts ?? []);
    const orphan = [...answerable].filter(v => !emits.has(v)).sort();
    if (!orphan.length) continue;

    // A verdict whose code another verdict ALSO carries is score-neutral to
    // remove, which is worth saying: it turns "decide what this means" into
    // "delete it", and the check that cannot say so gets deferred.
    const codes = slot.codes ?? {};
    const counts = new Map<string, number>();
    for (const c of Object.values(codes)) counts.set(c, (counts.get(c) ?? 0) + 1);
    const dup = orphan.filter(v => v in codes && (counts.get(codes[v]) ?? 0) > 1);

    out.push(
      `${slot.item}/${slot.key} offers verdict(s) ${pyList(orphan)} that `
      + `MAPS cannot emit (it produces ${pyList(emitsBase)} from `
      + `\`${slot.pick}\`). The grader can answer that and the map has no `
      + `rule for it. `
      + (dup.length
        ? `${pyList(dup)} duplicate(s) another verdict's deduction code, so removing `
          + `them is score-neutral by construction. `
        : '')
      + `Give the map a pair or fallback for it, or drop it from the slot`);
  }
  return out;
}
