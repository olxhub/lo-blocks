// A sheet attribute in the .olx that the RUBRIC does not produce.
//
// Ported from `enforcement.check_olx_attributes_are_all_generated` (goal K).
//
// STRICT, and it is the guarantee the conversion exists to make: an item's slot
// sheet must be DERIVABLE from the design, so a design change is a rubric edit
// and never a hand edit to a generated file.
//
// TWO FAILURES, AND THEY ARE DIFFERENT FAULTS:
//   UNACCOUNTED -- the attribute is on the tag and NO generator claims it. That
//     is hand-authored, and it means some behaviour has no design of record.
//     Eight such clauses were found this way, shipping and scoring and
//     undeclared, so a regenerate could not reproduce them and no design change
//     could express them.
//   DIVERGED -- a generator claims it and produces something else. That is the
//     window between a rubric edit and a rebuild, which is where 32 probe calls
//     were lost measuring a five-option menu while the rule described six.
//
// WHY IT IS NOT MERELY A REBUILD-AND-DIFF. That compares the file to what the
// writer WOULD write, so it goes quiet the moment the file is regenerated --
// including for an attribute the writer copies through untouched. This asks the
// different question: is every attribute PRODUCED BY A GENERATOR from the
// rubric? An attribute nobody generates passes a rebuild-and-diff forever.
//
// THE GENERATORS ARE THIS PACKAGE'S OWN. `attributeAssembler.generatedAttrs`
// is the same computation the writer uses -- one copy, two callers -- so this
// check cannot pass by comparing a transcription to itself.

export type OlxAttrsPayload = {
  /** Attribute names some generator claims. */
  known: string[];
  /** Structural attributes, not generated from the rubric. */
  skip: string[];
  /** Attributes DECLARED hand-authored, name -> why. */
  handAuthored?: Record<string, string>;
  items: Array<{
    item: string;
    /** The open tag's attributes IN SOURCE ORDER: [name, value]. */
    attrs: Array<[string, string]>;
    /** What each claimed generator produces for this item. */
    generated: Record<string, string | null>;
    /** Generators that raised, by attribute name. */
    errors?: Record<string, string>;
  }>;
};

/** Python's `x[:60]!r` for the values these attributes hold. */
function clip(s: string): string {
  const body = s.slice(0, 60)
    .replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  if (body.includes("'") && !body.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}

export function olxAttributesAreAllGenerated(p: OlxAttrsPayload): string[] {
  const known = new Set(p?.known ?? []);
  const skip = new Set(p?.skip ?? []);
  const hand = p?.handAuthored ?? {};
  const seenHand = new Set<string>();
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    for (const [name, have] of it.attrs ?? []) {
      if (skip.has(name)) continue;
      // DECLARED HAND-AUTHORED. Not silence: the entry carries its reason, and
      // the stale-entry pass below refuses one that has stopped applying.
      if (name in hand) { seenHand.add(name); continue; }
      if (!known.has(name)) {
        out.push(
          `${it.item}: \`${name}=\` is HAND-AUTHORED -- no generator in ` +
          `olx_prompts.GENERATED_ATTRS produces it, so a design ` +
          `change cannot reach it and \`--write\` cannot regenerate ` +
          `it. Give the rubric the fact and add a generator.`);
        continue;
      }
      const err = it.errors?.[name];
      if (err !== undefined) {
        out.push(`${it.item}: the generator for \`${name}=\` raised ${err}`);
        continue;
      }
      const gen = it.generated?.[name] ?? null;
      // EMPTY AND ABSENT ARE THE SAME THING HERE, on both sides: python
      // compares `(gen or None) != (have or None)`, so an attribute the
      // generator leaves empty matches one the .olx spells as "".
      if ((gen || null) === (have || null)) continue;
      out.push(
        `${it.item}: \`${name}=\` DIVERGED from the rubric -- the .olx has ` +
        `${clip(have)} and the generator produces ${clip(String(gen))}. ` +
        `Run \`npm run build:assemble-prompts -- --write\` and ` +
        `confirm the rendered body, not just the attribute.`);
    }
  }
  // A DECLARATION THAT NO LONGER APPLIES IS ONE NOBODY REMOVES. If the
  // attribute has gone from every tag, the exception is excusing nothing and
  // should be dropped rather than left to look like a live decision.
  for (const name of Object.keys(hand).sort()) {
    if (seenHand.has(name)) continue;
    out.push(
      `HAND_AUTHORED_SHEET_ATTRS declares \`${name}=\`, which is no longer ` +
      `authored on any sheet. The exception is excusing nothing -- drop it, ` +
      `or say which tag still carries it.`);
  }
  return out;
}
