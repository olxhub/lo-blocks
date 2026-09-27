// Do a cell's fixture boxes hold text belonging to DIFFERENT elements?
//
// Ported from `enforcement.check_consensus_spans_are_disjoint` (goal K).
//
// `handsplitRowsAreDisjoint` enforces this invariant over the hand-split files,
// which is one item. A consensus fixture is built from per-component evidence
// quotes the scorer chose INDEPENDENTLY, so nothing has ever required those
// spans to partition the response: not to be ordered, not to be disjoint, not
// to be complete. The coverage check covers completeness; this covers the rest.
//
// ONE OVERLAP IS PERMITTED AND IS A STRATEGY, not a tolerance. `state_cN` names
// WHICH consequence and `affect_cN` says what becomes of it; where the student
// wrote one clause doing both jobs, putting that clause in BOTH boxes is what
// lets each be judged on it. Removing the redundancy was measured and made the
// fixture more faithful and LESS scoreable -- one box had been earning its
// credit on the phrase it shared, and our scoring became stricter than gold's.
//
// A COVER GROUP IS AN EXPECTED OVERLAP TOO. When the sheet declares two boxes
// as answering one list between them, the grader asks which each refers to and
// demotes one that names an item already claimed -- so identical text there is
// the input the mechanism exists to resolve, not a defect.
//
// THE FLOOR IS 10 CHARACTERS, NOT 25. At 25 it skipped the most suspicious case
// there is: a box holding a FRAGMENT lifted out of a neighbour's sentence. Two
// such fragments were 19 characters, the scorer answered `incomplete` about
// them -- correctly -- and the cell lost credit gold awards.

export type ConsensusSpansPayload = {
  cells: Array<{ h: number; item: string; pid: number; boxes: Record<string, string> }>;
  /** `<handout>|<item>` -> pid -> [kind, why] */
  exclusions: Record<string, Record<string, [string, string]>>;
  /** item -> groups of boxes the sheet declares as covering one list. */
  cover: Record<string, string[][]>;
  /** [item, pid, boxA, boxB, why] */
  backlog: Array<[string, number, string, string, string]>;
  /** Role pairs that may legitimately hold the same clause, e.g. state/affect. */
  siblingRoles?: string[][];
};

const norm = (x: string) => String(x ?? '').split(/\s+/).filter(Boolean).join(' ').toLowerCase();

/**
 * Do two boxes name the same element in a PAIRED pair of roles?
 *
 * A box is `<role>_<element>`. Two boxes may legitimately hold one clause when
 * they describe the same element from paired roles -- one naming WHICH, the
 * other what becomes of it.
 *
 * THE ROLES ARE DECLARED, NOT SPELLED HERE. This was `head === 'state' ?
 * 'affect' : 'state'`, which put one instrument's box vocabulary inside an
 * engine whose purpose is to know no course, and which was quietly WIDER than
 * it read: anything paired with `state` on the same suffix was exempt,
 * including a role nobody had defined. The rule is generic; the vocabulary
 * comes from the record. The user's question, 2026-09-26: the mechanism needs
 * to generalise to new courses.
 *
 * NO DECLARATION MEANS NO EXEMPTION, which is the safe direction: a course that
 * has not said which roles pair gets every overlap reported rather than a
 * silent pass on a rule it never wrote.
 */
function paired(a: string, b: string, roles: string[][]): boolean {
  const split = (x: string) => {
    const at = x.lastIndexOf('_');
    return at <= 0 || at === x.length - 1
      ? null : { role: x.slice(0, at), element: x.slice(at + 1) };
  };
  const pa = split(a), pb = split(b);
  if (!pa || !pb || pa.element !== pb.element) return false;
  return (roles ?? []).some(
    ([r1, r2]) => (pa.role === r1 && pb.role === r2)
               || (pa.role === r2 && pb.role === r1));
}

/** Python's `x[:52]!r`. */
function clip(s: string): string {
  const body = s.slice(0, 52).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  if (body.includes("'") && !body.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}

export function consensusSpansAreDisjoint(p: ConsensusSpansPayload): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const key = (i: string, pid: number, a: string, b: string) => `${i}\u0000${pid}\u0000${a}\u0000${b}`;
  const declared = new Map((p?.backlog ?? []).map(e => [key(e[0], e[1], e[2], e[3]), e]));

  for (const cell of p?.cells ?? []) {
    // AN `unscoreable` CELL HAS HAD ITS GOLD WITHDRAWN, reaches no comparison
    // and cannot move a number. It is a blunt instrument: one cell's overlap
    // sat exempt here for as long as the cell was excluded -- not because
    // anyone judged it faithful, but because this branch never looked. An
    // exclusion written about the SCORE silences every other question.
    const ex = p.exclusions?.[`${cell.h}|${cell.item}`]?.[String(cell.pid)];
    if ((ex?.[0] ?? '') === 'unscoreable') continue;
    const bx: Record<string, string> = {};
    for (const [k, v] of Object.entries(cell.boxes ?? {})) if (v) bx[k] = norm(v);
    const keys = Object.keys(bx).sort();
    const groups = (p.cover?.[cell.item] ?? []).map(g => new Set(g));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i], b = keys[j];
        if (paired(a, b, p.siblingRoles ?? [])) continue;
        if (groups.some(g => g.has(a) && g.has(b))) continue;
        if (bx[a].length < 10 || bx[b].length < 10) continue;
        if (!bx[a].includes(bx[b]) && !bx[b].includes(bx[a])) continue;
        const k = key(cell.item, cell.pid, a, b);
        if (declared.has(k)) { seen.add(k); continue; }
        const inner = bx[a].length < bx[b].length ? a : b;
        out.push(
          `${cell.item}/p${cell.pid}: \`${a}\` and \`${b}\` hold the same text ` +
          `(${clip(bx[inner])}...) \u2014 one clause answering two different ` +
          `questions. Either the consensus mis-assigned it, or declare ` +
          `it in CONSENSUS_OVERLAP_BACKLOG with why it is faithful`);
      }
    }
  }
  // A DECLARATION THAT NO LONGER APPLIES IS ONE NOBODY REMOVES.
  for (const [k, e] of [...declared.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (seen.has(k)) continue;
    out.push(
      `CONSENSUS_OVERLAP_BACKLOG lists ${e[0]}/p${e[1]} ${e[2]}/${e[3]}, ` +
      `which no longer overlaps. Remove it`);
  }
  return out;
}
