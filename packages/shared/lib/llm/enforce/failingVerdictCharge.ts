// Can a scored slot answer something the paper ledger charges nothing for?
//
// Ported from `enforcement.check_every_failing_verdict_has_a_charge` (goal K).
//
// THE AUTHORING FORM of a difference that otherwise waits for the model to
// produce it. The web fails anything that is not the satisfying verdict; the
// paper ledger charges only what a deduction CODE names. So a third verdict
// with no code is scored by one engine and forgiven by the other -- and it
// stays invisible until the model happens to answer it, which for Q1's
// `unclear` took 62 observations and one cell.
//
// READ OFF THE RUBRIC, so a new verdict is caught when it is AUTHORED rather
// than by a sweep later.
//
// A DECLARED COUNTERPART IS COVERAGE. The two engines' vocabularies differ by
// design -- the app's `wrong_kind` is the mirror's `not_antecedent` on one item
// and `not_consequence` on another -- so comparing NAMES alone reported seven
// counterpart shapes as gaps the first time this was written. `sameVerdict`
// reads the declared pairs instead.

export type ChargeSlot = {
  what: string;
  pts: number | null;
  verdicts: string[];
  codes: Record<string, string>;
  /**
   * What the SHEET declares this slot may answer, or null when the slot was
   * not found there. EMPTY IS A REAL ANSWER -- "offers the defaults and nothing
   * else" -- and conflating it with null reintroduces the fault E52 exists to
   * stop: the rule then falls back to the rubric, which is the side that was
   * already wrong.
   */
  offered: string[] | null;
};

export type ChargePayload = {
  items: Array<{ id: string; credit: ChargeSlot[] }>;
  /** Declared [web vocabulary, paper vocabulary] pairs naming one judgement. */
  divergences: Array<[string[], string[]]>;
  /** Declared exemptions: [item, slot, verdict]. */
  uncharged: Array<[string, string, string]>;
};

/** Python's `repr` for a plain token: single quotes. */
function q(s: string): string { return `'${s.replace(/'/g, "\\'")}'`; }

export function everyFailingVerdictHasACharge(p: ChargePayload): string[] {
  const div = p?.divergences ?? [];
  const same = (a: string | null, b: string | null): boolean => {
    if (a === b) return true;
    if (a === null || b === null) return false;
    for (const [web, paper] of div) {
      if ((web.includes(a) && paper.includes(b))
          || (paper.includes(a) && web.includes(b))) return true;
    }
    return false;
  };
  const exempt = new Set((p?.uncharged ?? []).map(t => JSON.stringify(t)));
  const byId = new Map((p?.items ?? []).map(i => [i.id, i]));
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    for (const c of it.credit ?? []) {
      const verdicts = [...(c.verdicts ?? [])];
      if (!c.pts || verdicts.length < 2) continue;
      const codes = c.codes ?? {};
      // THE SHEET, not only the rubric. The grader answers the SHEET, and the
      // two can differ: a verdict dropped from the rubric while the option
      // stayed in `slots=` left the audit clean and the grader still answering
      // it.
      for (const v of [...(c.offered ?? [])].sort()) {
        if (!verdicts.includes(v)) verdicts.push(v);
      }
      // `met` BY NAME where offered, else the FIRST option -- lo-blocks'
      // `isSatisfied` rule, mirrored rather than assumed positional.
      const sat = verdicts.includes('met') ? 'met'
                : (verdicts.length ? verdicts[0] : null);
      for (const v of verdicts) {
        if (v === sat || same(v, sat)) continue;
        if (Object.keys(codes).some(k => same(v, k))) continue;
        if (exempt.has(JSON.stringify([it.id, c.what, v]))) continue;
        out.push(
          `${it.id}/${c.what} can answer ${q(v)}, and the paper ledger has ` +
          `no deduction code for it -- so paper charges 0 where the web ` +
          `charges the slot's full ${c.pts} points. Give it a code, or ` +
          `declare it in enforcement.UNCHARGED_VERDICTS with the ` +
          `measurement that says forgiving it is right`);
      }
      // THE REVERSE DIRECTION, which nothing checked: a verdict the paper
      // ledger CHARGES that the web counts as satisfying. It costs points on
      // paper and nothing on the web -- silent OVER-credit on the side students
      // are actually graded by.
      if (sat !== null && Object.keys(codes).some(k => same(sat, k))) {
        out.push(
          `${it.id}/${c.what}: the paper ledger charges ${q(sat)} via ` +
          `${codes[sat]}, and the web treats ${q(sat)} as SATISFYING -- so ` +
          `the same answer loses points on paper and keeps them on the ` +
          `web, which is the direction that over-credits a student`);
      }
      // THE POSITIONAL FALLBACK. `isSatisfied` reads `met` by NAME and every
      // other vocabulary by POSITION, and rests on the two agreeing on every
      // slot in the current content -- a measured coincidence with nothing
      // re-testing it.
      if (verdicts.includes('met') && verdicts[0] !== 'met') {
        out.push(
          `${it.id}/${c.what} lists \`met\` at position ${verdicts.indexOf('met')}, ` +
          `not first. lo-blocks' isSatisfied reads \`met\` by NAME and every ` +
          `other vocabulary by POSITION, so this slot is the case where ` +
          `those two rules stop agreeing -- and the paper ledger has no ` +
          `positional rule at all`);
      }
    }
  }
  // AND THE DECLARATIONS THEMSELVES, sorted as python's `sorted(...)` is: an
  // exemption that outlives what it excused is a silence nobody revisits.
  const decls = [...(p?.uncharged ?? [])].sort((a, b) =>
    JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  for (const [itemId, what, v] of decls) {
    const item = byId.get(itemId);
    if (!item) continue;
    const hit = (item.credit ?? []).filter(c => c.what === what);
    if (!hit.length) {
      out.push(`UNCHARGED_VERDICTS names ${itemId}/${what}, which the ` +
               `rubric no longer scores -- drop the declaration`);
    } else if (!(hit[0].verdicts ?? []).includes(v)) {
      out.push(`UNCHARGED_VERDICTS names ${itemId}/${what}=${q(v)}, which ` +
               `the slot can no longer answer -- drop the declaration`);
    } else if (v in (hit[0].codes ?? {})) {
      out.push(`UNCHARGED_VERDICTS says ${itemId}/${what}=${q(v)} is not ` +
               `charged, but the rubric now charges it -- drop the ` +
               `declaration`);
    }
  }
  return out;
}
