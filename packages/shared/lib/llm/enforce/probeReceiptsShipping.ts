// A probe was run, read and acted on -- and the string it asked no longer ships.
//
// Ported from `enforcement.check_probe_receipts_match_shipping` (goal K).
//
// THE BACKSTOP UNDER `question_for`. That function makes probe/sweep identity
// STRUCTURAL: it lifts the question out of the built prompt, so a probe cannot
// ask a string the sweep does not render. What construction cannot cover is
// TIME -- probe on Monday, edit the desc on Tuesday, sweep on Wednesday citing
// Monday's result. The receipt records the sha actually asked; this compares it
// against the sha shipping now.
//
// THREE MECHANISMS, AND THEY ARE NOT INTERCHANGEABLE:
//   the design shas  shipped == designed. Silent on the incident this exists
//                    for: the shipped desc WAS the designed desc, and the
//                    PROBE was the odd one out.
//   `questionFor`    probed == shipped, by construction, at PROBE time.
//   this check       probed == shipped, at SWEEP time.
//
// A RECEIPT FOR A SLOT THAT NO LONGER EXISTS is reported too, at lower stakes:
// a reverted slot's probe is stale by definition, and the entry should be
// dropped rather than left to look like evidence for the next attempt.

import { questionFor, type QuestionPayload } from './probeQuestion';

export type ProbeReceiptsPayload = QuestionPayload & {
  receipts: Array<{ item: string; slot: string; sha: string; verdict?: string }>;
  /** `item|slot` -> why `questionFor` refuses it, when it does. */
  refusals?: Record<string, string>;
};

export function probeReceiptsMatchShipping(p: ProbeReceiptsPayload): string[] {
  const out: string[] = [];
  for (const r of p?.receipts ?? []) {
    const key = `${r.item}|${r.slot}`;
    const refusal = p.refusals?.[key];
    if (refusal) {
      out.push(
        `${r.item}/${r.slot}: a probe recorded verdict ` +
        `${r.verdict || '(none)'} on a slot that is no longer ` +
        `asked -- ${refusal.split('\n')[0]}. Drop the receipt or rebuild ` +
        `the slot; it is not evidence for the next attempt`);
      continue;
    }
    const now = questionFor(r.item, r.slot, p);
    if (!now) continue;          // python raises here; the refusal map carries it
    if (now.sha === r.sha) continue;
    out.push(
      `${r.item}/${r.slot}: PROBED ${r.sha}, SHIPS ${now.sha} -- the probe ` +
      `answered a different question from the one the sweep will ask, ` +
      `which is what cost the Q19 sweep. Re-probe the shipping string ` +
      `(\`python3 scorers/probe.py ${r.item} ${r.slot}\`) before spending calls, or ` +
      `restore the text that was probed`);
  }
  return out;
}
