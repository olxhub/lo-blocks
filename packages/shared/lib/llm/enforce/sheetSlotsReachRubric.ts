// Does the SHEET ask anything no rubric element defines?
//
// Ported from `enforcement.check_sheet_slots_reach_the_rubric` (goal K, E49).
//
// THE REVERSE OF E48, and the direction nothing checked. If the two sides are
// meant to be parallel in content and logic, both directions have to hold.
//
// WHY IT IS THE HARDER DIRECTION, measured before it was built: a naive version
// reports 119 orphans of which ONE is real. A check whose false positives
// outnumber its true ones by 118 is switched off within a day and takes the
// real finding with it. The three exclusions are therefore LOAD-BEARING, and
// each was measured rather than assumed:
//
//   `confident`            a meta-slot on every item, with no rubric element
//                          and no points. By design.
//   CRITERIA-DERIVED ITEMS their rubric holds COMPOSITES while the sheet
//                          ENUMERATES the sub-checks, so nearly every slot
//                          looks orphaned in this direction.
//   ALIASED NAMES          a rubric key need not carry its web name; `webName`
//                          is the authority, as it is for E48.

import { webName } from './rubricSlotsReachSheet';

export type OrphanItem = {
  id: string;
  /** Slot keys the sheet asks, in `slots=` order, `!` stripped. */
  have: string[];
  /** Keys the rubric's credit list defines. */
  rubric: string[];
};

export function sheetSlotsReachTheRubric(
    p: { items: OrphanItem[]; alias: Record<string, string[]>;
         appOnly: Array<[string, string]> }): string[] {
  const appOnly = new Set((p?.appOnly ?? []).map(t => JSON.stringify(t)));
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    const rubric = new Set(it.rubric ?? []);
    const have = new Set(it.have ?? []);
    for (const key of it.have ?? []) {
      if (key === 'confident' || rubric.has(key)) continue;
      if (appOnly.has(JSON.stringify([it.id, key]))) continue;
      // AN ALIAS POINTING AT THIS KEY IS COVERAGE: the rubric defines it under
      // another name, which is what `webName` exists to resolve.
      if ([...rubric].some(r => webName(r, have, p.alias ?? {}) === key)) continue;
      out.push(
        `${it.id}/${key} is asked by the SHEET and defined by no rubric ` +
        `element, so the app puts a question to the grader that the ` +
        `python scorer never reads. Wire it into the rubric, remove it ` +
        `from the sheet, or declare it as deliberately app-only`);
    }
  }
  return out;
}
