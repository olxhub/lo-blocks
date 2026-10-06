// A MAPS table defined and never hung on the item spec.
//
// Ported from `enforcement.check_maps_tables_are_attached` (goal K), WITH A FIX:
// the python check could not report. Its messages interpolated `name`, a
// variable no longer bound after the loop moved from
// `for name, mod in (("rubric_h1", rubric_h1), ...)` to `for mod in
// _rubric_views()`. Either arm raised `NameError: name 'name' is not defined`
// the moment it fired, and it returned [] only because the corpus is clean.
// Its own docstring calls it "the cheapest check in the file".
//
// That is the exact failure this package keeps paying for -- a check reporting
// clean because it cannot report at all -- and it is why every rule ported
// under goal K is fired on a constructed positive before its original retires.
//
// WHY THE CHECK MATTERS. Defining `MAPS` does nothing on its own: the generator
// reads the item spec, so a table that is never attached emits no `maps=` and
// the pick has no route to its verdict. The rubric looks complete and the
// grader is asked a question whose answer cannot reach a score.

export type MapsEntry = {
  /** Which rubric the table lives in, 1-3. */
  handout: number;
  item: string;
  /** Does BY_ID know this item at all? */
  inSpec: boolean;
  /** Does the item spec carry a `maps` key? */
  attached: boolean;
};

export function mapsTablesAreAttached(p: { entries: MapsEntry[] }): string[] {
  const out: string[] = [];
  for (const e of p?.entries ?? []) {
    if (!e.inSpec) {
      out.push(
        `rubric_h${e.handout}: MAPS[${JSON.stringify(e.item)}] names an item ` +
        `that does not exist in BY_ID`);
    } else if (!e.attached) {
      out.push(
        `rubric_h${e.handout}: MAPS[${JSON.stringify(e.item)}] is defined but ` +
        `never attached to the item spec, so the generator emits no \`maps\` ` +
        `and the pick has no route to its verdict`);
    }
  }
  return out;
}
