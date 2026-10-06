// A ratchet may only tighten.
//
// Goal K, and the first port that serves SEVERAL python checks from one rule.
// The package holds a family of declared budgets -- hand-coded rules, the
// olx-only slot-rule backlog, prose-only slots, unexercised primitives -- and
// each check was the same fifteen lines with different nouns in them.
//
// THE TWO ARMS ARE NOT SYMMETRIC, and that is the whole design. Over budget
// means work was ADDED: a declaration is a promise to convert something, not a
// licence to keep it. UNDER budget is also a finding, because the slack is what
// lets the next entry in without the audit noticing -- a budget nobody lowers
// stops being a ratchet and becomes a ceiling.

export type Ratchet = {
  /** The declaration table's name, as the finding should say it. */
  table: string;
  /** The budget constant's name. */
  budgetName: string;
  count: number;
  budget: number;
  /** Singular noun for one entry, e.g. "hand-coded rule". */
  unit: string;
  /** What to do about an entry that was added. */
  advice: string;
};

export function ratchetsOnlyTighten(p: { ratchets: Ratchet[] }): string[] {
  const out: string[] = [];
  for (const r of p?.ratchets ?? []) {
    if (r.count > r.budget) {
      out.push(
        `${r.table} holds ${r.count} entries against a budget of ${r.budget} ` +
        `-- ${r.count - r.budget} ${r.unit}(s) were ADDED. ${r.advice}`);
    } else if (r.count < r.budget) {
      out.push(
        `${r.table} is down to ${r.count} entries but the budget still says ` +
        `${r.budget} -- lower it to ${r.count}, or the slack lets a new ` +
        `${r.unit} in without the audit noticing`);
    }
  }
  return out;
}
