// A probe measured a wording and only its SHA was recorded.
//
// Ported from `enforcement.check_probed_fields_keep_their_text` (goal K).
// Generic: "a sha detects drift; it cannot reproduce the string the result
// belongs to" is a statement about evidence, not about any subject.
//
// NOT EVERY FIELD, and the message says so: full text is kept for fields that
// carry EVIDENCE -- a probe result is an assertion about a particular string --
// while the rest stay sha-only by decision.

export type ProbeReceipt = {
  item: string;
  slot: string;
  sha: string;
  verdict?: string | null;
};

export type ProbedFieldsPayload = {
  receipts: ProbeReceipt[];
  /** `[item, slot, field]` triples whose full text IS recorded. */
  designed: Array<[string, string, string]>;
  /**
   * How many fields stay sha-only, for the message.
   *
   * DERIVED, WHERE PYTHON HARDCODED IT. Its f-string said "the other 145",
   * written when `DESIGNED_TEXT_SHA.json` held 145 fields; it holds 146 now, so
   * the literal had already drifted. Deriving it cannot move a baseline here --
   * the message renders only for a receipt whose text is NOT recorded, and
   * today every receipt's is, so the count is unobservable. E63/step 8.
   */
  shaOnly: number;
};

export function probedFieldsKeepTheirText(p: ProbedFieldsPayload): string[] {
  const have = new Set((p?.designed ?? []).map(d => `${d[0]} ${d[1]} ${d[2]}`));
  const out: string[] = [];
  for (const r of p?.receipts ?? []) {
    if (have.has(`${r.item} ${r.slot} desc`)) continue;
    out.push(
      `${r.item}/${r.slot}: a probe measured this wording ` +
      `(${r.sha}, verdict ${r.verdict || 'none'}) and only its ` +
      `sha is recorded. A sha detects drift; it cannot reproduce the ` +
      `string the result belongs to. Put the text in DESIGNED_TEXT ` +
      `(full text is for fields with evidence; the other ${p.shaOnly} stay ` +
      `sha-only by decision)`);
  }
  return out;
}
