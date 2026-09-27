// The gold sheets join to the rubric BY LABEL, and the workbook is what says so.
//
// Ported from `enforcement.check_gold_columns_are_the_item_labels` (goal K).
//
// THE RUBRIC'S `label` IS THE TEACHER'S COLUMN HEADING. That is how gold reaches
// an item at all: `<label> Score` and `<label> Feedback` are columns in that
// handout's sheet. Edit a label for wording and the join breaks silently -- the
// item simply loads no score and no feedback.
//
// IT USED TO COMPARE TWO COPIES. A hardcoded header->id table restated the same
// correspondence and this check held one to the other, which passes by
// construction and looks like coverage. The derivation replaced the table, so
// the check now asks the WORKBOOK -- the question that was only ever answered by
// hand, once.
//
// THE ENGINE NEVER OPENS A WORKBOOK. They are source documents holding student
// work, with the participant ids beside it. `tools/export_grader_columns.py`
// reads the sheet and exports the HEADINGS ALONE; this reads that record.
//
// AN UNREADABLE WORKBOOK IS A FINDING, NOT A PASS. A check that cannot run is
// not the same as one that passes, and the two must not print alike.

export type GoldColumnsPayload = {
  /** handout -> {label: item id}, from the rubric. */
  labels: Record<string, Record<string, string>>;
  /** handout -> the sheet's headings, or why they could not be read. */
  sheets: Record<string, { headings?: string[]; unreadable?: string }>;
};

export function goldColumnsAreItemLabels(p: GoldColumnsPayload): string[] {
  const out: string[] = [];
  const forms = Object.keys(p?.labels ?? {}).sort((a, b) => Number(a) - Number(b));
  for (const form of forms) {
    const sheet = p.sheets?.[form];
    if (!sheet) {
      out.push(
        `h${form}: the graders' workbook cannot be read (no record of its ` +
        `columns), so nothing here confirms the gold join -- and a check ` +
        `that cannot run is not the same as one that passes`);
      continue;
    }
    if (sheet.unreadable !== undefined) {
      out.push(
        `h${form}: the graders' workbook cannot be read (${sheet.unreadable}), ` +
        `so nothing here confirms the gold join -- and a check ` +
        `that cannot run is not the same as one that passes`);
      continue;
    }
    const headings = new Set(sheet.headings ?? []);
    if (headings.size === 0) {
      out.push(`h${form}: the graders' workbook has no rows at all`);
      continue;
    }
    const labels = p.labels[form] ?? {};
    for (const label of Object.keys(labels).sort()) {
      for (const suffix of ['Score', 'Feedback']) {
        if (headings.has(`${label} ${suffix}`)) continue;
        out.push(
          `h${form}: item '${labels[label]}' is labelled '${label}', and the ` +
          `graders' sheet has no '${label} ${suffix}' column ` +
          `-- the rubric label IS the column heading, so this ` +
          `item's ${suffix.toLowerCase()} would not load at all`);
      }
    }
  }
  return out;
}
