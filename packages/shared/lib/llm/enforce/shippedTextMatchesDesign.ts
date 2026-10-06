// A slot whose LIVE text differs from the wording its subgoal designed.
//
// Ported from `enforcement.check_shipped_text_matches_design` (goal K).
// Reported as SHIPPED TEXT DIFFERS FROM DESIGN.
//
// THE GUARANTEE IS designed -> shipped -> probed. A subgoal decides a wording,
// the rubric ships it, and a sweep measures it; break the first link and the
// sweep measures something nobody designed while the record says otherwise.
//
// A SLOT NAMED HERE AND ABSENT FROM THE RUBRIC IS NOT A FINDING. Designs are
// filed before they are built, and after a revert the entry should KEEP its
// text so the next attempt starts from the decision rather than from memory.
// What is refused is a slot that EXISTS and says something else.
//
// NORMALISED WHITESPACE, so re-wrapping a description is not a finding. The
// text is prose a grader reads; where the line breaks fall is not the design.

import { pyReprStr } from './pythonRepr';

export type ShippedTextPayload = {
  /** One design decision: the slot's field, and the wording it settled on. */
  designed: Array<{ item: string; slot: string; field: string; want: string }>;
  /** item id -> its credit components, each with every authored attribute. */
  credit: Record<string, Array<{ what: string; attrs: Record<string, string> }>>;
};

const norm = (x: unknown): string => String(x ?? '').replace(/\s+/g, ' ').trim();

export function shippedTextMatchesDesign(p: ShippedTextPayload): string[] {
  const out: string[] = [];
  // SORTED BY KEY, as python sorts `DESIGNED_TEXT.items()` -- the key is the
  // triple, so the order is by item, then slot, then field.
  const designed = [...(p?.designed ?? [])].sort((a, b) => {
    const ka = [a.item, a.slot, a.field], kb = [b.item, b.slot, b.field];
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
  for (const d of designed) {
    const comps = p.credit?.[d.item];
    if (!comps) continue;                  // item not in the rubric at all
    const comp = comps.find(c => c.what === d.slot);
    const got = comp?.attrs?.[d.field];
    if (got === undefined || got === null) continue;   // designed, not yet built
    const w = norm(d.want), g = norm(got);
    if (w === g) continue;
    // FIRST DIVERGENCE, so the reader is pointed at the character that differs
    // rather than handed two paragraphs to compare by eye.
    const lim = Math.min(w.length, g.length);
    let i = lim;
    for (let n = 0; n < lim; n++) if (w[n] !== g[n]) { i = n; break; }
    out.push(
      `${d.item}/${d.slot}.${d.field} SHIPS text its subgoal did not design. ` +
      `First divergence at char ${i}:\n` +
      `        designed: ...${pyReprStr(w.slice(Math.max(0, i - 40), i + 60))}\n` +
      `        shipped : ...${pyReprStr(g.slice(Math.max(0, i - 40), i + 60))}`);
  }
  return out;
}
