// Does every registered self-graded cell still have a citation to justify it?
//
// Ported from `enforcement.check_citations_match_exclusions` (goal K).
//
// A cell is registered because the item's prompt NAMES that participant and
// states the grader's decision, which makes scoring it recall rather than
// judgement. Edit the guidance and that justification can vanish while the
// registration stays -- and the item then reports a rate over cells chosen for
// a reason that no longer exists, which is the exact flattery the registry was
// built to remove.
//
// BOTH DIRECTIONS ARE WRONG AND BOTH ARE REPORTED: registered but no longer
// cited drops a cell from the rate for nothing; cited but not registered hands
// the model the answer and counts it anyway.
//
// DELIBERATELY NARROW. It compares against `cited_participants` ONLY, not the
// merged exclusion view: exemplars are reproduced in full and never attributed,
// so no regex can find them, and unscoreable cells are about a gold row rather
// than a prompt. An earlier version compared against the merged set and
// reported both as faults -- two false alarms out of two findings.

export type CitationItem = {
  form: number | string;
  id: string;
  /** Every field of the item that reaches the generated prompt. */
  promptText: string;
  /** Participants the registry says this item cites. */
  registered: number[];
};

export type CitationPayload = {
  items: CitationItem[];
  /** Handout-wide exemplars, which are never attributed and never registered. */
  exemplars: Record<string, number[]>;
};

// The python regex, character for character: `participants 4, 5 and 6`.
const CITED = /participants?\s+((?:\d+)(?:\s*(?:,|and)\s*\d+)*)/gi;

function pyList(ns: number[]): string { return `[${ns.join(', ')}]`; }

export function citationsMatchExclusions(p: CitationPayload): string[] {
  const problems: string[] = [];
  for (const it of p?.items ?? []) {
    const cited = new Set<number>();
    for (const m of it.promptText.matchAll(CITED)) {
      for (const n of m[1].match(/\d+/g) ?? []) cited.add(Number(n));
    }
    const registered = new Set(it.registered ?? []);
    const exemplars = new Set(p.exemplars?.[String(it.form)] ?? []);
    const stale = [...registered].filter(n => !cited.has(n)).sort((a, b) => a - b);
    if (stale.length) {
      problems.push(
        `H${it.form} ${it.id}: excludes ${pyList(stale)} as self-graded, but the ` +
        `prompt no longer names them \u2014 the rate drops those cells for ` +
        `a reason that no longer exists`);
    }
    const missing = [...cited]
      .filter(n => !registered.has(n) && !exemplars.has(n))
      .sort((a, b) => a - b);
    if (missing.length) {
      problems.push(
        `H${it.form} ${it.id}: the prompt names ${pyList(missing)} with the ` +
        `grader's decision, and the rate counts them \u2014 that is ` +
        `self-grading. Register them in cited_participants`);
    }
  }
  return problems;
}
