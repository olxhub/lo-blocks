// A reach-limit entry whose rule the probe could now reach.
//
// Ported from `enforcement.check_probe_reach_limits_still_apply` (goal K),
// SPLIT: python reads each item's sheet and computes the two shape facts, this
// judges whether the excuse still holds.
//
// WHAT AN ENTRY CLAIMS: the CLI probe cannot construct the state that would
// reveal a sublinear pair. That claim rests on the SHEET, not on the run data,
// which is what makes it checkable here at all -- this check runs INSIDE the
// audit and could not call the audit back to ask.
//
// TWO SHAPES MAKE A PAIR UNREACHABLE, and an entry is justified only while its
// item still has one of them:
//
//   a `forbid` with THREE OR MORE conditions -- the probe flips answered fields
//     pairwise, so a three-way condition is out of its reach;
//   a `requires` whose condition is a COMPUTED key -- the probe cannot flip
//     what the scorer derives.
//
// Lose both and a pairwise flip CAN reach the pair, so the excuse has expired.
// An expired excuse is invisible by construction: the pair stops being probed,
// nothing fails, and the entry goes on excusing a limit that is no longer
// there.

export type ProbeReachPayload = {
  /** One row per (entry, item) pair python could resolve a sheet for. */
  items: Array<{
    item: string;
    /** Has a `forbid` of three or more conditions. */
    wide: boolean;
    /** Has a `requires` whose condition is a computed key. */
    unflippable: boolean;
  }>;
};

export function probeReachLimitsStillApply(p: ProbeReachPayload): string[] {
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    if (it.wide || it.unflippable) continue;
    out.push(
      `olx_prompts.PROBE_REACH_LIMITS excuses ${it.item} on the grounds ` +
      `that the CLI probe cannot reach its sublinear pair, but ${it.item} ` +
      `now has no \`forbid\` of three or more conditions and no ` +
      `\`requires\` on a computed key -- so a pairwise flip CAN reach ` +
      `it and the excuse no longer holds. Drop the item from the ` +
      `entry and let the audit probe it`);
  }
  return out;
}
