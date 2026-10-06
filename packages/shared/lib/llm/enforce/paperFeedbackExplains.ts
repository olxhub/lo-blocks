// On the PAPER side: does a deduction that costs points say why?
//
// Ported from `enforcement.check_paper_feedback_explains_its_deductions`
// (goal K). Python reads the artifacts and the rubric; EVERYTHING AFTER THAT
// -- attribution, classification, tallying, reporting -- is here.
//
// THE PAPER ANALOGUE, AND DELIBERATELY A DIFFERENT QUESTION from the web's.
// The web renders a CHECKLIST, so its failure is a tick beside no words.
// score.py renders a DEDUCTION LEDGER -- "-2 pts: reason" -- so full credit
// correctly prints nothing, and the failure is a charge whose reason is
// missing: the rubric has no text for the code, the model wrote no note, and
// the student reads a number with nothing after it.
//
// UNKNOWN CODES ARE REPORTED ONLY WHERE A CHARGE WAS POSSIBLE, and that filter
// is the difference between a useful check and a permanently red one.
// `unknown_codes` is dominated by STRUCTURE, not defect: a CLASSIFICATION slot
// is a credit component with no `codes`, no points and no met/absent
// vocabulary, so it is never "met", reaches the unknown branch on every cell,
// and is recorded harmlessly -- 594 entries across the corpus, every one an
// unscored component. Reporting those would bury the case that matters: a slot
// that COULD have cost points failing in a way the rubric has no words for,
// where the student is charged nothing and told nothing about a real miss.
//
// ONE ATTRIBUTABLE ARTIFACT IS ENOUGH. The corpus keeps every artifact it has
// ever written, so a single undated archival directory once condemned an item
// no matter how fresh its newest measurement was -- all 26 items reported
// unattributable on the morning a correctly-stamped sweep of all 26 landed.
// The message asks "no paper artifact attributable"; the set must answer that
// and not "some paper artifact is not".

/** A charge whose ledger line has nothing after the colon. */
const EMPTY = /-\s*[\d.]+\s*pts?:\s*$/;

export type PaperFeedbackPayload = {
  unreadable?: string | null;
  /** The render fingerprint every artifact is attributed against. */
  want: string;
  /** Per item: the rubric's deduction texts and its credit components. */
  rubric: Record<string, {
    /** deduction code -> the text the student would read. */
    texts: Record<string, string>;
    /** credit `what` -> whether it can cost points at all. */
    scorable: Record<string, boolean>;
  }>;
  artifacts: Array<{
    item: string;
    /** The artifact's own render stamp, or null when it carries none. */
    stamp: string | null;
    results: Array<{
      itemId: string;
      deductions: Array<{ code: string; note: string }>;
      feedback: string[];
      unknownCodes: string[];
    }>;
  }>;
};

export function paperFeedbackExplainsItsDeductions(p: PaperFeedbackPayload): string[] {
  if (p?.unreadable) {
    return [`${p.unreadable} -- this check cannot run, which is NOT the same as passing`];
  }
  const reasonless = new Map<string, number>();
  const unknown = new Map<string, number>();
  const unattributable = new Set<string>();
  const attributed = new Set<string>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const a of p?.artifacts ?? []) {
    const rub = p.rubric?.[a.item];
    if (!rub) continue;
    if (a.stamp !== p.want) { unattributable.add(a.item); continue; }
    attributed.add(a.item);
    for (const r of a.results ?? []) {
      if (r.itemId !== a.item) continue;
      for (const d of r.deductions ?? []) {
        if (!(rub.texts?.[d.code] ?? '').trim() && !(d.note ?? '').trim()) {
          bump(reasonless, JSON.stringify([a.item, String(d.code)]));
        }
      }
      for (const line of r.feedback ?? []) {
        if (EMPTY.test(line.trim())) {
          bump(reasonless, JSON.stringify([a.item, '<a charge with no words after it>']));
        }
      }
      for (const code of r.unknownCodes ?? []) {
        // ONLY WHERE A CHARGE WAS POSSIBLE -- see the note above.
        if (!rub.scorable?.[String(code).split(':')[0]]) continue;
        bump(unknown, JSON.stringify([a.item, String(code)]));
      }
    }
  }

  const out: string[] = [];
  const byCount = (m: Map<string, number>) =>
    [...m.entries()].sort((x, y) => y[1] - x[1]);
  for (const [k, n] of byCount(reasonless)) {
    const [item, code] = JSON.parse(k) as [string, string];
    out.push(`${item}: a deduction charged points as '${code}' and the ` +
             `student read no reason for it -- x${n}`);
  }
  for (const [k, n] of byCount(unknown)) {
    const [item, code] = JSON.parse(k) as [string, string];
    out.push(`${item}: the paper scorer answered '${code}', which the ` +
             `rubric defines no code for, so it was dropped -- x${n}. It ` +
             `cost nothing; it means the grader is answering in a ` +
             `vocabulary the rubric does not share`);
  }
  for (const it of attributed) unattributable.delete(it);
  if (unattributable.size) {
    out.push(`${unattributable.size} item(s) have no paper artifact ` +
             `attributable to today's feedback wording, so what their ` +
             `students read cannot be checked (${[...unattributable].sort().join(', ')})`);
  }
  return out;
}
