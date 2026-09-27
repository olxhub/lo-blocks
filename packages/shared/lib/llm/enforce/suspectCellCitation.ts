// Does any declaration argue FROM a cell whose transcription cannot be trusted?
//
// Ported from `enforcement.check_no_declaration_cites_a_suspect_cell` (goal K).
//
// A suspect participant's input cannot be attributed at all -- two transcriptions
// are byte-identical with different gold rows, so at least one is wrong and
// neither can be relied on. A suspect cell is therefore evidence for NOTHING in
// either direction, and a declaration that reasons from one has a hole in it.
//
// THE LEAK CAN ONLY ENTER THROUGH THE `why`. Declarations are keyed by cell, and
// the key is checked elsewhere; it is the PROSE that quietly leans on a cell it
// should not.
//
// A SENTENCE THAT NAMES THE CELL AS SUSPECT IS ALLOWED -- that is an entry
// recording the rule rather than breaking it. So the scan is per sentence, and a
// sentence mentioning `suspect` or `exclud` is skipped entirely.

export type SuspectPayload = {
  /** table, label, home item, and the prose to scan. */
  entries: Array<{ table: string; label: string; home: string; why: string }>;
  /** item id -> the handout it lives on. */
  homeOf: Record<string, number>;
  /** handout -> participants whose input cannot be trusted. */
  suspect: Record<string, number[]>;
};

/**
 * Cells a reason CITES: `<ITEM>/p<N>` anywhere, and a bare `p<N>` attributed
 * to `home`.
 *
 * The bare form is why `home` is carried: a reason about one cell says "p<N>"
 * without repeating the item, and reading that as un-homed would miss the
 * citations that matter most.
 */
function cited(why: string, home: string): Array<[string, number]> {
  const out = new Set<string>();
  for (const sent of String(why ?? '').split(/(?<=[.!?;])\s+/)) {
    if (/suspect|exclud/i.test(sent)) continue;   // naming the rule, not leaning on it
    for (const m of sent.matchAll(/\b([A-Za-z][\w]*)\s*\/\s*p(\d+)\b/g)) {
      out.add(`${m[1]}\u0000${m[2]}`);
    }
    const bare = sent.replace(/\b[A-Za-z][\w]*\s*\/\s*p\d+\b/g, ' ');
    for (const m of bare.matchAll(/\bp(\d+)\b/g)) out.add(`${home}\u0000${m[1]}`);
  }
  return [...out].map(k => {
    const [it, pid] = k.split('\u0000');
    return [it, Number(pid)] as [string, number];
  });
}

export function noDeclarationCitesASuspectCell(p: SuspectPayload): string[] {
  const out: string[] = [];
  for (const e of p?.entries ?? []) {
    const hits = cited(e.why, e.home)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
    for (const [it, pid] of hits) {
      const hnd = p.homeOf?.[it];
      if (hnd === undefined) continue;
      if (!(p.suspect?.[String(hnd)] ?? []).includes(pid)) continue;
      out.push(
        `${e.table} \`${e.label}\` argues from ${it}/p${pid}, which ` +
        `\`handouts.suspect(${hnd})\` drops because its transcription ` +
        `cannot be trusted. A suspect cell is evidence for nothing in ` +
        `either direction, so this reasoning has a hole in it: either ` +
        `find the argument that does not need it, or say inside the ` +
        `citing sentence that the cell is suspect and why it is being ` +
        `named anyway.`);
    }
  }
  return out;
}
