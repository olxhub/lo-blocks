// A parking lot rots in two ways, and both are silent.
//
// Ported from `enforcement.check_parked_entries_still_apply` (goal K).
//
// An entry parks a known issue so the audit stops reporting it. That is useful
// and it is also an OVERRIDE, so it needs two things nobody notices when they
// go missing: a budget that was raised DELIBERATELY when the entry was added,
// and a reason saying what would unpark it. An entry with neither is a
// permanent silence for a finding nobody remembers.

import { pyRepr } from './pythonRepr';

export type ParkedEntry = {
  /** The (item, kind) key, as a pair. Anything else is malformed. */
  key: unknown[];
  // NO PRE-RENDERED KEY. This carried a `keyRepr` that python produced with
  // `repr(k)`, which made the rule uncallable from inside lo-blocks -- a native
  // caller has no python to ask. It renders the structured key itself now, with
  // `pyRepr`, verified against CPython on 142 keys. Same defect as the
  // shared-prose port had; found by re-auditing after the first scan reported
  // all clear, because that scan sliced the function body and missed payloads.
  why: string;
};

/** The shortest reason that can actually say what would unpark something. */
const MIN_REASON = 30;

export function parkedEntriesStillApply(
  p: { entries: ParkedEntry[]; budget: number },
): string[] {
  const out: string[] = [];
  const n = (p?.entries ?? []).length;
  if (n > (p?.budget ?? 0)) {
    out.push(
      `PARKED_UNDECLARED holds ${n} entr(ies) against a budget of ` +
      `${p.budget}. An issue was parked without raising the budget -- raise it ` +
      `deliberately with the entry, or unpark`);
  }
  for (const e of p?.entries ?? []) {
    if (!Array.isArray(e.key) || e.key.length !== 2) {
      out.push(`PARKED_UNDECLARED key ${pyRepr(e.key as never)} is not (item, kind)`);
    }
    if (String(e.why ?? '').trim().length < MIN_REASON) {
      out.push(
        `PARKED_UNDECLARED[${pyRepr(e.key as never)}] gives no usable reason. Say what the ` +
        `issue is and what would unpark it -- a park with no reason is an ` +
        `override that never expires`);
    }
  }
  return out;
}
