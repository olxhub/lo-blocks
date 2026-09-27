// Does every code a slot maps a verdict to actually exist?
//
// Ported from `enforcement.check_slot_codes_exist` (goal K). Generic: a name
// used somewhere must be declared somewhere, four times over.
//
// NOTHING ELSE CHECKED THIS. `derive_ledger` puts whatever the map says
// straight into the ledger, so a typo'd code would be emitted, carry a slot's
// points and reach the student's feedback with NO WORDING BEHIND IT -- a
// misspelling presenting as a rubric finding.
//
// `onlyif` IS KEYED BY THE SHEET, NOT BY THE CREDIT LIST, and testing it
// against credit names reported TEN FALSE GAPS. Both evaluators key the charge
// map on the SHEET's slots, so a name is live iff the sheet has it. On the four
// conditioning types the two tables come apart BY DESIGN: the rubric holds
// COMPOSITES while the sheet ENUMERATES the sub-checks, and it is the sheet's
// slot that carries the points.
//
// Checking `cond` matters more than checking `key`: an UNKNOWN condition
// suppresses nothing, deliberately, so a typo'd cond does not fail loudly -- it
// makes the rule inert and the item charges twice for one cause.

export type SlotCodesItem = {
  id: string;
  /** The deduction CODES this item declares. */
  deductions: string[];
  credit: Array<{ what: string; codes?: Record<string, string> | null }>;
  blankCode?: string | null;
  counts?: Array<{ key: string; slots: string[] }>;
  onlyif?: Array<{ key: string; cond: string }>;
  /** The keys on this item's SHEET -- not its credit list. */
  sheet: string[];
};

export function slotCodesExist(p: { items: SlotCodesItem[] }): string[] {
  const problems: string[] = [];
  for (const it of p?.items ?? []) {
    const valid = new Set(it.deductions ?? []);
    for (const c of it.credit ?? []) {
      for (const [verdict, code] of Object.entries(c.codes ?? {})) {
        if (!valid.has(code)) {
          problems.push(
            `${it.id}: \`${c.what}\`/${verdict} -> \`${code}\`, ` +
            `which is not one of its deduction codes`);
        }
      }
    }
    const want = it.blankCode;
    if (want && !valid.has(want)) {
      problems.push(
        `${it.id}: blank_code \`${want}\` is not one of its ` +
        `deduction codes`);
    }
    for (const cr of it.counts ?? []) {
      // REBUILT PER GROUP, as python's loop does. Hoisting it would be tidier
      // and would change nothing; leaving it here keeps the two readable side
      // by side.
      const names = new Set((it.credit ?? []).map(c => c.what));
      for (const k of [cr.key, ...cr.slots]) {
        if (!names.has(k)) {
          problems.push(
            `${it.id}: counts names \`${k}\`, which is not a ` +
            `credit component`);
        }
      }
    }
    const universe = new Set([...(it.sheet ?? []), ...(it.credit ?? []).map(c => c.what)]);
    for (const r of it.onlyif ?? []) {
      for (const k of [r.key, r.cond]) {
        if (!universe.has(k)) {
          problems.push(
            `${it.id}: onlyif names \`${k}\`, which is neither ` +
            `a slot on its sheet nor a credit component, so ` +
            `the rule is inert and the charge is never ` +
            `suppressed`);
        }
      }
    }
  }
  return problems;
}
