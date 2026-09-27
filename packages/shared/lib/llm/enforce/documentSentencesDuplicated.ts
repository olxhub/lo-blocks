// A sentence that survives in BOTH halves of a split document.
//
// Ported from `enforcement.check_no_composed_document_repeats_itself` (goal K),
// which delegates to `compose_docs.duplicated`.
//
// A RULE LIFTED OUT OF A RECORD MUST BE DELETED FROM THE RECORD. Copied instead
// of moved, the composed document says the same sentence twice -- and nothing
// else reports it, because the result reads as emphasis rather than as a
// mistake. That is the failure this catches: not a broken document, a document
// that quietly argues with itself.
//
// PROSE ONLY, AND LONG PROSE. A sentence under 30 characters is as likely to be
// a heading or a fragment as a claim, and a line that does not START like prose
// -- a table row, a bullet marker, a code fence -- is structure that both halves
// may legitimately share.

export type DuplicatedSentencesPayload = {
  /** One entry per split document that HAS both halves on disk. */
  docs: Array<{ name: string; generic: string; specific: string }>;
};

const SENTENCE = /(?<=[.!?])\s+/;
const PROSE_LINE = /^[A-Za-z*`[(]/;

/** The comparable sentences of one half: flattened, long enough, prose-shaped. */
export function documentSentences(text: string): Set<string> {
  const flat = (text ?? '').replace(/\s+/g, ' ');
  const out = new Set<string>();
  for (const piece of flat.split(SENTENCE)) {
    const s = piece.trim();
    if (s.length > 30 && PROSE_LINE.test(s)) out.add(s);
  }
  return out;
}

export function documentSentencesDuplicated(p: DuplicatedSentencesPayload): string[] {
  const out: string[] = [];
  for (const d of p.docs ?? []) {
    const g = documentSentences(d.generic);
    const c = documentSentences(d.specific);
    const both = [...g].filter(s => c.has(s)).sort();
    for (const sent of both) {
      out.push(
        `${d.name} has this sentence in BOTH halves -- ${pyRepr(sent.slice(0, 70))}...` +
        ` A rule lifted out of a record must be DELETED from the record; copied ` +
        `instead of moved, the composed document says it twice and it reads as ` +
        `emphasis`);
    }
  }
  return out;
}

/** python's `repr` of a string, so the two engines' findings compare byte for byte. */
function pyRepr(s: string): string {
  const esc = s.replace(/\\/g, '\\\\');
  return esc.includes("'") && !esc.includes('"')
    ? `"${esc}"`
    : `'${esc.replace(/'/g, "\\'")}'`;
}
