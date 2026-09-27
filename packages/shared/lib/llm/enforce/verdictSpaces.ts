// Do the two scorers' verdict spaces differ in a shape nobody has declared?
//
// Ported from `enforcement.check_verdict_spaces_are_declared` (goal K). Python
// fetches both spaces -- the web's from the shipped sheet with `pick(NAME)`
// enums resolved, the paper side's from the rubric -- and reports; the
// comparison lives here.
//
// THE OTHER HALF OF NEUTRALITY. The neutrality check stops a shared `rule` from
// naming a token one side lacks. This asks about the asymmetries THEMSELVES, so
// that a new one gets looked at rather than absorbed.
//
// DECLARED BY SHAPE, NOT BY SLOT, and that is the design worth preserving in
// the port: the same asymmetry recurs across many slots, and per-slot entries
// would turn one decision into dozens of rows that no one rereads. A shape is
// `(olx-only, paper-only)`, so declaring it once covers every slot that differs
// in exactly that way -- and stops covering it the moment the difference
// changes shape.
//
// GENERIC BY THE PROJECT'S OWN TEST: "two engines scoring one sheet should
// offer the same verdicts unless someone said why" assumes nothing about
// behaviour modification. The spaces and the declarations are supplied.

/** One slot as both sides see it. */
export type VerdictSlot = {
  item: string;
  what: string;
  /** What the WEB sheet offers. */
  web: string[];
  /** What the PAPER side offers. */
  paper: string[];
};

export type VerdictSpacesPayload = {
  slots: VerdictSlot[];
  /** Declared shapes, each `[olxOnly, paperOnly]`. */
  divergences: Array<[string[], string[]]>;
};

/** A set rendered as Python renders `sorted(...)` of strings. */
function pyList(xs: Iterable<string>): string {
  const sorted = [...new Set(xs)].sort();
  return `[${sorted.map(x => `'${x}'`).join(', ')}]`;
}

/** The canonical identity of a shape, so declarations match by VALUE. */
function shapeKey(olxOnly: Iterable<string>, paperOnly: Iterable<string>): string {
  return `${[...new Set(olxOnly)].sort().join('')}${[...new Set(paperOnly)].sort().join('')}`;
}

/**
 * Every slot whose two verdict spaces differ in an undeclared shape.
 *
 * A slot whose spaces are EQUAL is silent, and so is one whose difference has a
 * declared shape. Order follows python: items in the order the caller supplies
 * them, credits within an item in their own order.
 */
export function verdictSpacesAreDeclared(p: VerdictSpacesPayload): string[] {
  const declared = new Set(
    (p?.divergences ?? []).map(([a, b]) => shapeKey(a ?? [], b ?? [])));
  const problems: string[] = [];
  for (const slot of p?.slots ?? []) {
    const web = new Set(slot.web ?? []);
    const paper = new Set(slot.paper ?? []);
    const olxOnly = [...web].filter(x => !paper.has(x));
    const paperOnly = [...paper].filter(x => !web.has(x));
    if (!olxOnly.length && !paperOnly.length) continue;
    if (declared.has(shapeKey(olxOnly, paperOnly))) continue;
    problems.push(
      `${slot.item}.${slot.what}: the two scorers' verdict spaces differ `
      + `in a shape nothing declares -- olx-only ${pyList(olxOnly)}, `
      + `paper-only ${pyList(paperOnly)}. Either make them match, or add `
      + `the shape to VERDICT_SPACE_DIVERGENCES with the reason and `
      + `whether it moves a score`);
  }
  return problems;
}
