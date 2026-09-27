// An answerable slot the ledger has never seen, with no probe receipt.
//
// Ported from `enforcement.check_new_slots_were_probed` (goal K).
//
// THE VACUOUS-PASS HALF. With no receipt on record, the receipt-vs-shipping
// check is clean because there is nothing to compare -- and a clean result
// there reads exactly like a verified one. Asked directly ("are we sweeping the
// same prompt as the one we last probed?") the gate could not answer, and its
// silence looked like a yes.
//
// DELIBERATELY NARROW. It does NOT ask every changed field for a probe: one
// leak fix changed every prompt in the corpus for a good reason, and a check
// demanding a probe per field would have refused all of it. What it asks about
// is a slot that is ANSWERABLE, is not in the last recording's cell data, and
// has no receipt -- a brand new question about to be measured for the first
// time. That is the one case where the probe is nearly free (~30 calls) and the
// sweep is not (~230).
//
// WEB SIDE ONLY, and that is why it can live here: it reads the `olx` column,
// which `measured.web_sides()` derives from the side contract. A paper column
// would have no counterpart in this engine.

export type NewSlotsPayload = {
  /** item -> the slots the shipped checklist ASKS an LLM about. */
  asked: Record<string, string[]>;
  /** item -> every slot name the last recording's cells carried. */
  seen: Record<string, string[]>;
  /** item -> the slots a probe receipt covers. */
  probed: Record<string, string[]>;
};

export function newSlotsWereProbed(p: NewSlotsPayload): string[] {
  const out: string[] = [];
  for (const item of Object.keys(p?.asked ?? {}).sort()) {
    const seen = new Set(p.seen?.[item] ?? []);
    // NEVER RECORDED MEANS NOTHING TO COMPARE. An item with no runs on this
    // side is not an item whose every slot is new; it is an item we have not
    // measured, and reporting all of them would bury the one that matters.
    if (!seen.size) continue;
    const probed = new Set(p.probed?.[item] ?? []);
    for (const slot of [...(p.asked[item] ?? [])].sort()) {
      if (seen.has(slot) || probed.has(slot)) continue;
      out.push(
        `${item}/${slot} is an answerable slot the last recording never ` +
        `saw and no probe has ever asked. A new question costs ~30 calls ` +
        `to probe standalone and ~230 to learn from a sweep: ` +
        `\`python3 scorers/probe.py ${item} ${slot}\` (QUALITY_CONTROL.md 2a)`);
    }
  }
  return out;
}
