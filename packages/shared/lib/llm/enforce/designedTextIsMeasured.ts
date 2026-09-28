// A registered design that is not the text its own evidence asked.
//
// Ported from `enforcement.check_designed_text_is_the_measured_text` (goal K).
//
// THE GENERIC PART IS THE FINGERPRINT, and it is the part worth sharing. "A
// design must be the text that was MEASURED, not a summary of the result" is a
// statement about evidence; and `fieldSha` -- normalise whitespace, hash the
// words -- is the rule that decides when two spellings are the same text. Both
// engines must fingerprint identically or the comparison means nothing, which
// is precisely the divergence class this package exists to close.
//
// PYTHON RESOLVES `{{corpus:...}}` AND PASSES THE RESOLVED TEXT. Since the
// history rewrite a field that quotes a student holds a reference where the
// registered design held the sentence, so the reference must be expanded before
// hashing -- seven fields across all three handouts reported CHANGED with no
// word altered when it was not. Expanding needs the response records, so the
// caller does it; hashing the raw text here would reintroduce exactly that
// false alarm. See NATIVE_BLOCKED for why this rule has no native assembler.

import { createHash } from 'node:crypto';

export type DesignedTextPayload = {
  receipts: Array<{
    item: string;
    slot: string;
    /** DESIGNED_TEXT for (item, slot, 'desc'), with `{{corpus:...}}` RESOLVED. */
    designed: string;
    /**
     * The designed field AS PROBED -- the receipt's `checklist_sha`, falling
     * back to `sha`. Those were one thing until the probe question grew a second
     * section; comparing a raw rubric field against a two-section string can
     * never be equal, so every slot registered after that change became a
     * "paraphrase" of its own evidence BY ARITHMETIC. The fallback keeps
     * receipts written before the split honest rather than silently unchecked.
     */
    probed: string;
  }>;
};

/** Fingerprint a prompt field by its WORDS, not by how they are encoded. */
export function fieldSha(text: string): string {
  return createHash('sha256')
    .update(String(text ?? '').replace(/\s+/g, ' ').trim())
    .digest('hex')
    .slice(0, 12);
}

export function designedTextIsMeasured(p: DesignedTextPayload): string[] {
  const out: string[] = [];
  for (const r of p?.receipts ?? []) {
    const want = fieldSha(r.designed);
    if (want !== r.probed) {
      out.push(
        `${r.item}/${r.slot}: DESIGNED_TEXT is ${want} but ` +
        `the probe that is its only evidence asked ${r.probed}. The design ` +
        `was not lifted from the artifact that measured it -- take it from ` +
        `the probe script, not from a summary of the result`);
    }
  }
  return out;
}
