// Does the student read a REASON beside every check that scored them?
//
// Ported from `enforcement.check_students_see_what_each_check_decided`
// (goal K), SPLIT: python reads the artifacts and tallies; this reports.
//
// THE AUDIT COMPARES ENGINES, DECLARATIONS AND SCORES, and never once asked
// what reached the student. It is a different question with a different
// answer: a check can score perfectly and still render a tick against no
// words, on a check carrying half the item. Scoring reads an operand as
// `refers_to ?? verdict`; three DISPLAY paths read only `.verdict`, and every
// shipped `equals`, `expect` and `maps` operand is a classification -- which
// answers `refers_to`. The score was right and the explanation was blank, on
// 1046 recorded lines across 11 checks and 11 items.
//
// AGGREGATED PER (item, check), NOT PER LINE, because 1046 standing findings
// is a list nobody reads and 11 is one somebody fixes.
//
// THREE SILENCES ARE EACH REPORTED RATHER THAN PASSED, and they are different:
//
//   NO OUTPUT ROOT -- nothing to read at all;
//   NO ATTRIBUTABLE ARTIFACT for an item -- a display fix moves neither the
//     prompt fingerprint nor the score, so an artifact written before one
//     looks exactly like an artifact written after. Saying "the student saw
//     this" about text produced by code since repaired is a false report;
//   NOTHING CARRYING RENDERED FEEDBACK AT ALL -- a clean answer here would
//     mean "no student was shown a blank explanation", which is not what an
//     empty corpus shows.

export type StudentsSeePayload = {
  /** Why the run archive could not be reached, in python's words. */
  unreadable?: string | null;
  /**
   * Items with no artifact attributable to today's renderer, sorted.
   *
   * ONE ATTRIBUTABLE ARTIFACT IS ENOUGH, and python has already subtracted the
   * attributed ones: the set used to accumulate on the FIRST artifact that
   * failed, so an item with a current sweep was still reported because some
   * older artifact of the same item did not attribute. Every item has many
   * artifacts and most are old, which is why that reported the whole corpus.
   */
  unattributable: string[];
  /** How many attributable artifacts were actually read. */
  looked: number;
  /** (item, check label) -> how many rendered lines said nothing, count-desc. */
  tally: Array<{ item: string; label: string; n: number }>;
};

export function studentsSeeWhatEachCheckDecided(p: StudentsSeePayload): string[] {
  if (p?.unreadable) {
    return [`${p.unreadable} -- this check cannot run, which is NOT the same as passing`];
  }
  const out: string[] = [];
  const un = p?.unattributable ?? [];
  if (un.length) {
    out.push(
      `${un.length} item(s) have no artifact attributable to ` +
      `today's renderer, so what their students see cannot be checked at ` +
      `all (${un.join(', ')}). Each is answered by its ` +
      `next sweep, which stamps \`web_render_sha\`; until then this check is ` +
      `silent about them rather than guessing from text an older renderer ` +
      `produced`);
  }
  if (!p?.looked) {
    return out.length ? out : [
      'no readable artifact carries rendered feedback, so what ' +
      'the student saw cannot be checked -- sweep, or say why not'];
  }
  for (const t of p?.tally ?? []) {
    out.push(
      `${t.item}: the student read a tick or a cross beside ` +
      `'${t.label}' with the words 'not reported' -- x${t.n}. That check scored ` +
      `them and told them nothing. A computed check has no verdict of its ` +
      `own, so its line must render what it was computed FROM`);
  }
  return out;
}
