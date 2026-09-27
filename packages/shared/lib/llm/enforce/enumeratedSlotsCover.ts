// Did a declaration table written as `for n in (1, 2, 3)` outgrow its rubric?
//
// Ported from `enforcement.check_enumerated_slots_cover_the_rubric` (goal K,
// E60). It exists because of a FALSE POSITIVE: a scan for hardcoded form counts
// classified sixty-nine `(1, 2, 3)` sites as form iterations and four were not
// -- they enumerate SLOTS, and encode a different claim entirely: that a
// criterion has at most three parallel checks.
//
// THE TABLE IS SHORT, NOT WRONG, which is why nothing else reports it. Every
// entry it has is correct; it simply stops before the rubric does, so the
// slots past the end are governed by nothing.
//
// A RUN FROM 1, OR NOTHING. `reason_1..3` is a truncated loop; `reason_2` alone
// is a SELECTION, and a selection that skips one was never claiming to cover
// the family. Only a contiguous run from 1 is read as an enumeration.

export type EnumPayload = {
  /** Declaration tables in record order; each a list of [item, slot] keys. */
  tables: Array<{ name: string; keys: Array<[string, string]> }>;
  /** `{item: {stem: width}}` -- how many the rubric actually declares. */
  widths: Record<string, Record<string, number>>;
};

export function enumeratedSlotsCoverTheRubric(p: EnumPayload): string[] {
  const out: string[] = [];
  for (const table of p?.tables ?? []) {
    const seen = new Map<string, Set<number>>();
    for (const [item, slot] of table.keys ?? []) {
      const m = /^(.+?)_(\d+)$/.exec(slot);
      if (!m) continue;
      const key = `${item}\u0000${m[1]}`;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(Number(m[2]));
    }
    for (const key of [...seen.keys()].sort()) {
      const ns = seen.get(key)!;
      const [item, stem] = key.split('\u0000');
      const k = Math.max(...ns);
      // CONTIGUOUS FROM 1, or it is a selection rather than a truncated loop.
      let run = true;
      for (let n = 1; n <= k; n += 1) if (!ns.has(n)) { run = false; break; }
      if (!run || ns.size !== k) continue;
      const have = p.widths?.[item]?.[stem];
      if (have && have > k) {
        out.push(
          `${table.name} enumerates ${stem}_1..${k} for ${item} and the rubric ` +
          `declares ${stem}_1..${have} -- the table is SHORT, not ` +
          `wrong, so nothing else reports it. The enumeration is ` +
          `written as a range; derive it from the rubric instead`);
      }
    }
  }
  return out;
}
