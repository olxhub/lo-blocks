// Is each item's recorded number still the number of the CURRENT setup?
//
// Ported from `enforcement.check_items_are_measured_as_configured` (goal K),
// SPLIT: python reads each side's status from the ledger, this judges.
//
// A published rate means nothing apart from the prompt the grader was sent and
// the cells the rate was computed over, and BOTH can change without leaving
// anything that looks changed. A rule rewrite is one diff among many in the
// same commit. Removing an exclusion DELETES the only record that the cell was
// ever in question. So an item whose prompt was rewritten and whose denominator
// grew is, in the tree, indistinguishable from an item nobody touched.
//
// EVERY SIDE, NOT THE DEFAULT ONE. The two can genuinely disagree, because the
// prompt fingerprint is side-aware: the python harness never reads some
// open-tag attributes, so a change to one of THOSE leaves the cli fingerprint
// identical while the web's moves. Read from the cli alone, this gate would
// call an item current while the number the web column publishes was measured
// against a different prompt -- the exact statement it exists to prevent.
//
// ABSENT IS THE DEFAULT SIDE'S BUSINESS ONLY. Every item is expected to carry a
// cli number; the paper sides are swept separately and their absence belongs to
// another check, not to this gap.
//
// SAID ONCE PER ITEM AND STATE. Both sides going stale the same way is one
// fact, and printing it twice makes a two-item problem look like four.

export type ItemsConfiguredPayload = {
  /** The side whose absence is a gap here. */
  defaultSide: string;
  /** In `measured.SIDES` order; a side whose status threw is simply absent. */
  sides: Array<{ side: string; rows: Array<{ item: string; state: string }> }>;
};

export function itemsMeasuredAsConfigured(p: ItemsConfiguredPayload): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const s of p?.sides ?? []) {
    for (const { item, state } of s.rows ?? []) {
      if (state.startsWith('ABSENT')) {
        if (s.side !== p.defaultSide) continue;
        problems.push(
          `${item} has no entry in MEASURED.json. Sweep it and run ` +
          `\`measured.py --record ${item} OUT/${item}.runs.json\`, or declare ` +
          `\`pending\` with a reason saying when it will be measured`);
      } else if (state.startsWith('STALE PROMPT')) {
        if (seen.get(item) === state) continue;
        seen.set(item, state);
        problems.push(
          `${item} [${s.side}]: ${state}. Its prompt text changed since the ` +
          `recorded measurement, so the recorded number is not this ` +
          `prompt's number — re-sweep and re-record`);
      } else if (state.startsWith('STALE CELLS')) {
        if (seen.get(item) === state) continue;
        seen.set(item, state);
        problems.push(
          `${item} [${s.side}]: ${state}. Its denominator changed since the ` +
          `recorded measurement, so the recorded number was computed ` +
          `over a different set of cells — re-sweep and re-record`);
      }
    }
  }
  return problems;
}
