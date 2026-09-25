// Structural questions about what was RECORDED, asked in lo-blocks.
//
// Ported from `enforcement.check_no_recorded_run_is_verdictless` (goal K). The
// first classification called measurement checks python's by nature; they are
// not. "Did this run judge anything at all?" is a question about the SHAPE of a
// recorded result, generic for any course scored by `SlotSheetGrader`. Python
// resolves WHICH artifacts belong to the column — the ledger owns that, with
// its `out` pointers and goal O's `folded_from` — and this reads and judges.

import { readCourseJson } from './courseData';

export type ArtifactRef = { item: string; side: string; path: string };

/**
 * Runs recorded with a score and NO VERDICTS AT ALL.
 *
 * WHY IT IS WORTH HAVING FOR ONE ROW. WK1/p1's HTTP 429 was the only row in
 * 6,147 with a null score, and it was found by a string match on the provider's
 * English. This asks the structural question instead, so a failure that returns
 * politely is caught the same way.
 */
export function verdictlessRuns(p: { artifacts: ArtifactRef[] }): string[] {
  const out: string[] = [];
  for (const a of p?.artifacts ?? []) {
    let doc: any;
    try {
      doc = readCourseJson('COURSE_DATA', a.path);
    } catch (e) {
      // REPORTED, NEVER SKIPPED. An unreadable artifact is a column this could
      // not examine, and silence there reads exactly like a clean column.
      out.push(`${a.item} [${a.side}]: recorded artifact could not be read — ` +
               `${String(e)}`);
      continue;
    }
    const runs = doc?.runs ?? [];
    for (let n = 0; n < runs.length; n++) {
      for (const r of runs[n]?.results ?? []) {
        const verdicts = r?.verdicts;
        const score = r?.grader?.score;
        if (verdicts && Object.keys(verdicts).length) continue;
        if (score === undefined || score === null) continue;
        // THE RECORDED `cell` ALREADY CARRIES THE ITEM -- it is `p9/Q1`, not
        // `p9` -- so prefixing the item again produced `Q1/p9/Q1`. The python
        // original wrote `{item}/p{pid}`; take the pid out and match it, because
        // a ported check that changes a finding's wording is indistinguishable,
        // in a baseline diff, from a new fault.
        const pid = String(r?.cell ?? '?').split('/')[0];
        out.push(
          `${a.item}/${pid} [${a.side}] run ${n} is recorded with ` +
          `score ${score} and NO VERDICTS AT ALL. A run that judged nothing is ` +
          `not a measurement of the rubric; it is a failed call that reached ` +
          `the ledger with a number attached`);
      }
    }
  }
  return out;
}
