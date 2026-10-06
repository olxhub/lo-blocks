// A recorded column whose artifact cannot be read.
//
// Ported from `measured.sides_recorded_but_unreadable`, behind
// `enforcement.check_recorded_sides_are_readable` (goal K).
//
// WHY IT MATTERS MORE THAN IT LOOKS. The ownership check walks CELLS, so a side
// whose artifact cannot be read contributes no findings — and that is
// indistinguishable, in its output, from a side that gets everything right. A
// column can go dark and every per-cell check keeps reporting clean about it.

import { readCourseJson } from './courseData';

export type RecordedSide = {
  item: string;
  side: string;
  numerator: number;
  denominator: number;
  /** The `out` pointer as the ledger records it, for the message. */
  out: string;
  /** Path relative to $COURSE_DATA, resolved by python from the ledger. */
  path: string;
};

export function recordedSidesAreReadable(
  p: { sides: RecordedSide[]; ns: string },
): string[] {
  const out: string[] = [];
  for (const s of p?.sides ?? []) {
    let doc: any;
    try {
      doc = readCourseJson('COURSE_DATA', s.path, p.ns);
    } catch {
      out.push(
        `${s.item} [${s.side}] is recorded at ${s.numerator}/${s.denominator} ` +
        `but its artifact cannot be found at out/${s.out}/${s.item}.runs.json, ` +
        `so every per-cell check reads it as having nothing wrong`);
      continue;
    }
    // PRESENT IS NOT THE SAME AS READABLE. An artifact holding no runs is as
    // silent to a per-cell walk as one that is missing, and a check that only
    // asked whether the file EXISTS would pass it.
    if (!Array.isArray(doc?.runs) || doc.runs.length === 0) {
      out.push(
        `${s.item} [${s.side}] is recorded at ${s.numerator}/${s.denominator} ` +
        `and its artifact at out/${s.out}/${s.item}.runs.json holds NO RUNS, ` +
        `so every per-cell check reads it as having nothing wrong`);
    }
  }
  return out;
}
