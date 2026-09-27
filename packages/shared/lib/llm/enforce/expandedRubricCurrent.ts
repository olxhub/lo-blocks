// Is the expanded rubric still the authored one?
//
// Ported from `enforcement.check_the_expanded_rubric_is_current` (goal K).
//
// `coursedata.items()` reads `.stage/expanded`, which is a BUILD PRODUCT, so
// scoring depends on a build having run. A stale expansion means a stale rubric
// SILENTLY: every item still parses, every slot still reads, and the scores
// describe a rubric nobody is editing.
//
// IT COMPARES THE BYTES, and that is exact only while no template exists. With
// nothing to expand, `materialiseRubric` copies the file through unchanged --
// it is written not to reformat, and its own test asserts byte-identity -- so
// any difference at all is staleness.
//
// THE COMPARISON EXPIRES THE DAY A TEMPLATE LANDS, and says so rather than
// quietly becoming wrong: an expanded file SHOULD differ from its source then,
// and this would read that as staleness on every run.

export type ExpandedPayload = {
  /** How the finding names the authored file. */
  authoredName: string;
  authoredExists: boolean;
  /** The expanded file's path, which the finding prints in full. */
  expandedPath: string;
  expandedExists: boolean;
  src: string | null;
  have: string | null;
};

/** Python's `{:,}` -- thousands separated by commas. */
function commas(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function expandedRubricIsCurrent(p: ExpandedPayload): string[] {
  if (!p?.authoredExists) {
    return [`${p.authoredName} is missing: there is no authored ` +
            `rubric to expand`];
  }
  if (!p.expandedExists) {
    return [`the rubric has not been expanded (${p.expandedPath}); run ` +
            `\`npm run build:expand-rubrics\`. The scorer reads the expanded ` +
            `copy, so an unbuilt tree scores against nothing`];
  }
  const src = p.src ?? '';
  if (src.includes('<ItemTemplate')) {
    return [`${p.authoredName} declares an <ItemTemplate>, and ` +
            `this check compares bytes -- which was exact only while nothing ` +
            `expanded. It must now run the expander and compare its output, ` +
            `or it will call every correct expansion stale. Upgrade it.`];
  }
  const have = p.have ?? '';
  if (have !== src) {
    return [`the expanded rubric is not the authored one ` +
            `(${commas(have.length)} bytes expanded, ${commas(src.length)} authored), and with ` +
            `no template to expand they must match byte for byte. The rubric ` +
            `was edited since the last build: run ` +
            `\`npm run build:expand-rubrics\`.`];
  }
  return [];
}
