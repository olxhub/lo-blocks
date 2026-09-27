// A `derived` rule that names a field the harness cannot read.
//
// Ported from `enforcement.check_derived_fields_resolve` (goal K).
//
// A `derived` CHECK READS A FIELD ID; the harness's texts are keyed by SECTION,
// and the two are joined through the item's context refs. Look the field up
// directly and every lookup misses -- and the miss is SILENT, because an
// unresolvable field is indistinguishable from an empty one. Both mean "no
// text", both score the check unmet, and the run still prints a table.
//
// MEASURED: one item's rule missed on every one of its cells, two points each,
// an item that measures three quarters reporting one twentieth. Nothing failed,
// nothing was skipped, and the number was simply wrong.

export type DerivedFieldsPayload = {
  items: Array<{
    item: string;
    /** Absent when the harness has no block entry for this item at all. */
    hasBlock: boolean;
    /** The action could not be read; the message python would have printed. */
    error?: string | null;
    /** Field ids this item's context refs can resolve. */
    refFields: string[];
    /** Each `derived` rule: its key and the fields it reads. */
    derived: Array<{ key: string; fields: string[] }>;
  }>;
};

export function derivedFieldsResolve(p: DerivedFieldsPayload): string[] {
  const out: string[] = [];
  for (const it of p.items ?? []) {
    if (!it.hasBlock) {
      out.push(`${it.item}: no BLOCKS entry, so the harness cannot run it`);
      continue;
    }
    if (it.error) { out.push(`${it.item}: ${it.error}`); continue; }
    const refs = new Set(it.refFields ?? []);
    for (const rule of it.derived ?? []) {
      for (const f of rule.fields ?? []) {
        if (!refs.has(f)) {
          out.push(
            `${it.item}: derived \`${rule.key}\` reads field \`${f}\`, which is ` +
            `not in this item's refs — it would score unmet on every cell`);
        }
      }
    }
  }
  return out;
}
