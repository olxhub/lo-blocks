// Is each rubric table a well-formed set of distinct items?
//
// Ported from `enforcement.check_rubric_items_are_unique` (goal K, step 8).
// Python keeps the fetch -- it knows which forms a course declares and how to
// reach each one's rubric view -- and the judgement lives here.
//
// THE FAILURE IT EXISTS FOR, and it is the reason the invariants look trivial.
// A bad edit spliced a rubric file from the wrong offset: an index search
// matched one item's `credit` list instead of another's and re-included
// everything from there on. The file grew from 1,424 lines to 2,376 with TWO
// entries apiece for seven items, and `BY_ID` silently resolved to the second
// copy -- so the next edit was verified against a different dict than the one
// it had changed. EVERY AUDIT STAYED GREEN, because they all read through
// `BY_ID`, which is exactly the thing that had gone wrong.
//
// GENERIC BY THE PROJECT'S OWN TEST: "a list of items must not contain the same
// id twice, and an index over it must reach every one" assumes nothing about
// any course. The ids, the slots and the number of forms all arrive as data.

export type RubricItemsUniquePayload = {
  /** One entry per form the course declares. */
  forms: Array<{
    /** The form's label, used only to name the finding. */
    form: string | number;
    /** Item ids in ITEMS order, INCLUDING repeats -- the repeats are the point. */
    ids: Array<string>;
    /** How many entries the by-id index holds. */
    byIdCount: number;
    /** Per item, the slot names its credit list gives, including repeats. */
    credit: Array<{ id: string; slots: Array<string> }>;
  }>;
};

/** `{value: count}` for the values that appear more than once, in sorted order. */
function repeats(values: Array<string>): Array<[string, number]> {
  const seen = new Map<string, number>();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  return [...seen.entries()]
    .filter(([, n]) => n > 1)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Python's `repr` for the ids these findings quote: single-quoted strings. */
function q(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/'/g, "\\'")}'`;
}

export function rubricItemsAreUnique(p: RubricItemsUniquePayload): string[] {
  const problems: string[] = [];
  for (const f of p.forms ?? []) {
    const h = f.form;
    // 1. Item ids are distinct.
    for (const [iid, n] of repeats(f.ids ?? [])) {
      problems.push(
        `H${h}: rubric ITEMS has ${n} entries with id ${q(iid)}. BY_ID ` +
        `resolves to one of them and every audit here reads through ` +
        `BY_ID, so the others are invisible`);
    }
    // 2. The index reaches every distinct id.
    const distinct = new Set(f.ids ?? []).size;
    if ((f.byIdCount ?? 0) !== distinct) {
      problems.push(
        `H${h}: BY_ID has ${f.byIdCount} entries for ${distinct} ` +
        `distinct item ids`);
    }
    // 3. A slot name appears once in an item's credit list.
    for (const it of f.credit ?? []) {
      for (const [what, n] of repeats(it.slots ?? [])) {
        problems.push(`H${h} ${it.id}: credit lists ${q(what)} ${n} times`);
      }
    }
  }
  return problems;
}
