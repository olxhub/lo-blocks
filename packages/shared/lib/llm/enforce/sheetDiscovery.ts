// Can every item's slot sheet be FOUND, and is every generated attribute backed?
//
// Goal K. Both questions are about the shipped .olx and the rubric behind it —
// content against content — and both are generic for any course whose items
// hang a slot sheet off an element id.

/** One item and the element id its slot sheet is supposed to hang off. */
export type SheetRef = { item: string; elementId: string };

/**
 * An item whose sheet element cannot be found in any handout.
 *
 * SLOTS HANG OFF TWO DIFFERENT ELEMENTS: most items are graded by an
 * `<LLMAction>`, and a few carry their sheet on a `<DerivedChecks>`. A check
 * that cannot locate the element does not fail loudly — it reads no slots and
 * reports clean, which is how an item goes dark while every gate stays green.
 */
export function everyItemHasAFindableSlotSheet(
  p: { sheets: SheetRef[]; olx: string },
): string[] {
  const blob = String(p?.olx ?? '');
  if (!blob) {
    return ['no handout .olx text was supplied; sheet discovery cannot run, ' +
            'which is not the same as every sheet being findable'];
  }
  const out: string[] = [];
  for (const s of [...(p?.sheets ?? [])].sort(
    (a, b) => a.item.localeCompare(b.item))) {
    // ANY element type, matched by id: the point is reachability, not which
    // tag carries it. Escaped, because an id is data.
    const id = s.elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`<\\w+\\b[^>]*id="${id}"[^>]*>`, 's').test(blob)) continue;
    out.push(
      `${s.item}: no element with id="${s.elementId}" in any handout, so its ` +
      `slot sheet cannot be located. Every sheet-reading check is blind on ` +
      `this item and reports clean for it`);
  }
  return out;
}

/** One generated attribute found on a sheet, and whether the rubric backs it. */
export type GeneratedAttr = {
  item: string;
  name: string;
  value: string;
  /** Does a rubric rule produce this attribute? Python asks the generator. */
  backed: boolean;
  /** Declared hand-authored, and therefore exempt. */
  exempt: boolean;
};

/**
 * An attribute the generator OWNS, carried by the .olx, with no rubric rule behind it.
 *
 * The generator writes these from a rule that returns nothing when the rubric
 * declares none — so an attribute still present after its declaration was
 * removed is an ORPHAN, pointing the grader at a rule that no longer exists.
 */
export function generatedAttributesHaveADeclaration(
  p: { attrs: GeneratedAttr[] },
): string[] {
  const out: string[] = [];
  for (const a of p?.attrs ?? []) {
    if (a.backed || a.exempt) continue;
    if (!String(a.value ?? '').trim()) continue;   // absent or a placeholder
    out.push(
      `${a.item} carries a \`${a.name}=\` attribute the generator OWNS, and no ` +
      `rubric rule produces it: ${JSON.stringify(a.value.slice(0, 70))}. Either ` +
      `the declaration was removed and this is an ORPHAN pointing at a rule ` +
      `that no longer exists, or it was hand-authored and belongs in the ` +
      `declared exemptions`);
  }
  return out;
}
