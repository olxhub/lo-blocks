// How much course SHAPE the engine's flag vocabulary carries.
//
// Ported from `property_ratchet.verify` (goal K), SPLIT: python scans, this
// judges. D1x-c's ratchet, and the reason it is a ratchet rather than a ban:
//
//   A single branch on a property is not a defect -- `if caps["boxes"] == 8:`
//   reads a value, and a second course with six boxes still works. The harm is
//   ACCUMULATION: forty narrow booleans mean the engine is course-shaped again
//   in a new vocabulary. So the count of DISTINCT properties reached in a
//   branch may FALL and may not RISE without a declaration.
//
// WHY PYTHON KEEPS THE SCAN. Finding the branches means parsing PYTHON SOURCE,
// and the scan is deliberately narrow -- SUBSCRIPTS only, because `coursedata`
// hands out dicts and a course property is read as `item['field']`. An earlier
// version matched attributes too and every attribute hit was a false positive.
// That narrowness has a PREMISE (the reader still returns dicts) which python
// checks separately, because a check that goes blind while announcing the rule
// enforced turns "be careful here" into "the check passed".
//
// THREE DIRECTIONS, NOT ONE. A new undeclared property, a count that rose, and
// a budget entry nothing branches on any more. The third is the one that rots
// quietly: a reduction nobody re-tightened can be silently undone later.

export type PropertyRatchetPayload = {
  /** property name -> the sites that branch on it, first site first. */
  branched: Record<string, Array<{ file: string; line: number }>>;
  /** The budget as read, or null when it could not be. */
  budget: { branched: string[]; declared: Record<string, string> } | null;
  /** Why the budget could not be read: 'missing', or the parse error. */
  budgetError: string | null;
  /** Basename, quoted in every message. */
  budgetName: string;
};

export function propertyVocabularyRatchet(p: PropertyRatchetPayload): string[] {
  const out: string[] = [];
  const names = new Set(Object.keys(p?.branched ?? {}));

  // A BUDGET THAT CANNOT BE READ IS NOT A BUDGET THAT PASSES.
  if (p?.budget == null) {
    if (p?.budgetError === 'missing') {
      return [`${p.budgetName} is missing, so the property ratchet ` +
              `cannot run -- which is NOT the same as passing. Write it with ` +
              `\`property_ratchet.py --tighten\`.`];
    }
    return [`${p.budgetName} is unreadable: ${p?.budgetError}`];
  }

  const allowed = new Set(p.budget.branched ?? []);
  const declared = p.budget.declared ?? {};

  for (const name of [...names].filter(n => !allowed.has(n)).sort()) {
    if (!declared[name]) {
      const site = (p.branched[name] ?? [])[0] ?? { file: '?', line: 0 };
      out.push(
        `'${name}' is a declared PROPERTY and engine code branches on it ` +
        `(${site.file}:${site.line}). D1x-c says a value the ` +
        `engine branches on is BEHAVIOUR and belongs in a strategy ` +
        `registry. Make it a strategy, or declare in ` +
        `${p.budgetName} why a strategy would not do.`);
    }
  }
  if (names.size > allowed.size) {
    out.push(`the property vocabulary reached in branches grew ` +
             `${allowed.size} -> ${names.size}; the ratchet only tightens`);
  }
  for (const name of [...allowed].filter(n => !names.has(n)).sort()) {
    out.push(`'${name}' is in the budget and is no longer branched on -- ` +
             `re-tighten so the reduction cannot be undone`);
  }
  return out;
}
