// Every deduction code must be producible, or declared unreachable.
//
// Ported from `enforcement.check_codes_reachable` (goal K). The judgement is
// generic: "a penalty no verdict can emit is either a bug or a decision, and
// the rubric must say which" assumes nothing about any course — the codes, the
// slots and the declarations all arrive as data.
//
// THE FAILURE IT EXISTS FOR. A conversion silently retired live codes: an
// item's slots were given only met/absent/unclear, so a code emitted six times
// before became `absent` under a different one. Same points, so no accuracy
// number moved — the student was simply told the wrong thing, and a downstream
// item then lost its context because the evidence builder empties a box on
// `absent`. Nothing that counts points could have seen it.
//
// BOTH DIRECTIONS, because a declaration rots the other way too: a code named
// in `unreachable_codes` that is not one of the item's deductions is describing
// a penalty that no longer exists.

/** One item, as this rule needs to see it. */
export type CodesItem = {
  id: string;
  /** Only credit-derived items have a code path to check. */
  deriveFromCredit?: boolean;
  /** The code an empty response produces, if the item declares one. */
  blankCode?: string | null;
  /** Codes the rubric declares cannot be reached, with a reason elsewhere. */
  unreachableCodes?: string[];
  /** Per credit slot, the verdict -> code map. */
  credit: Array<{ codes?: Record<string, string> }>;
  /** Every deduction the item can charge. */
  deductions: Array<{ code: string; pts: number }>;
};

export type CodesReachablePayload = { items: CodesItem[] };

/**
 * Python's `f"{p:g}"` for the points a finding quotes.
 *
 * `:g` drops a trailing `.0` — 5.0 renders as `5`, 2.5 as `2.5`. A port that
 * used the default would differ from python on every whole-number deduction,
 * which is most of them, and the finding text is what a baseline diff compares.
 */
function g(p: number): string {
  return Number.isInteger(p) ? String(p) : String(p);
}

export function codesReachable(p: CodesReachablePayload): string[] {
  const problems: string[] = [];
  for (const it of p?.items ?? []) {
    if (!it.deriveFromCredit) continue;
    // THE BLANK CODE IS IN THE SET EVEN WHEN ABSENT, exactly as python's
    // `{it.get("blank_code")}` puts `None` in it: a set containing null matches
    // no real code, so the arm behaves the same and the shapes stay comparable.
    const reach = new Set<string | null | undefined>([it.blankCode ?? null,
      ...(it.unreachableCodes ?? [])]);
    for (const c of it.credit ?? []) {
      for (const v of Object.values(c.codes ?? {})) reach.add(v);
    }
    for (const d of it.deductions ?? []) {
      if (!reach.has(d.code)) {
        problems.push(
          `${it.id}: \`${d.code}\` (-${g(d.pts)}) can be produced by no slot ` +
          `verdict, and is not declared in unreachable_codes`);
      }
    }
    const charged = new Set((it.deductions ?? []).map(d => d.code));
    for (const code of it.unreachableCodes ?? []) {
      if (!charged.has(code)) {
        problems.push(
          `${it.id}: unreachable_codes names \`${code}\`, which is not one of ` +
          `its deduction codes`);
      }
    }
  }
  return problems;
}
