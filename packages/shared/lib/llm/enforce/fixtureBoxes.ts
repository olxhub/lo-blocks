// An item's OWN input boxes from a cell's fixture -- not its read-only context.
//
// Ported from `enforcement._fixture_boxes` (goal K). Shared, because three
// fixture checks select boxes this way and a second copy would drift away from
// the two corrections already recorded in it.
//
// READ FROM THE JOBS SPEC, NOT FROM FIELD NAMES. A name heuristic
// (`_<item>_<box>`) covered one handout, where fields are `..._q6_state_a1`,
// and silently returned NOTHING for handouts whose fields are `..._pr` or
// `..._success_verdict`. Both were absent from every fixture check -- reported
// as "no multi-box cells" when the truth was "not looked at".
//
// CORRECTION ONE: A FIELD BELONGING TO ANOTHER ITEM. A field cannot be keyed on
// this item's name alone, because some handouts' fields carry no item key at
// all. So the test is the other way round: a field belongs to another item when
// it carries THAT item's key and not this one's.
//
// CORRECTION TWO: THE LABEL COLLISION. `from_scorer` carries CONTEXT as well as
// the item's own response, and the context is another item's field. One item's
// spec pulled a neighbour's `first`/`second` so its grader could see them --
// and those label to `first`/`second`, exactly like its OWN. The labels
// collided, set iteration decided the winner, and that item's boxes came out
// holding the neighbour's text: every one of its cells was checked against a
// different item's answer. It raised no finding because the borrowed boxes were
// never EMPTY, which is the coverage check's only trigger.

export type JobSpec = {
  fields?: Record<string, string>;
  from_scorer?: Record<string, unknown>;
  sim?: Record<string, unknown>;
  handsplit?: string;
};

/** `{box: text}` for one cell, keyed by the SHORT label python uses. */
export function ownBoxes(
  item: string,
  fixture: Record<string, string>,
  spec: JobSpec,
  allItems: string[],
  handsplitKeys: string[] = [],
): Record<string, string> {
  const own = new Set<string>();
  for (const [f, src] of Object.entries(spec?.fields ?? {})) {
    if (src === item) own.add(f);
  }
  for (const f of Object.keys(spec?.from_scorer ?? {})) own.add(f);
  for (const f of Object.keys(spec?.sim ?? {})) own.add(f);
  for (const f of handsplitKeys) own.add(f);

  const key = `_${item.toLowerCase()}_`;
  for (const k of Object.keys(fixture ?? {})) {
    if (k.includes(key) && !k.includes('ref')) own.add(k);
  }
  const others = allItems.filter(o => o !== item).map(o => `_${o.toLowerCase()}_`);
  const kept = [...own].filter(
    f => f.includes(key) || !others.some(o => f.includes(o)));

  const label = (field: string) => {
    if (field.includes(key)) return field.split(key).pop() ?? field;
    const tail = field;
    return tail.slice(tail.lastIndexOf('_') + 1);
  };
  const out: Record<string, string> = {};
  for (const f of kept) {
    const l = label(f);
    if (!l) continue;
    out[l] = String(fixture?.[f] ?? '').trim();
  }
  return out;
}
