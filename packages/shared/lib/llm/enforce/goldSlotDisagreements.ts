// Cells where our failing slots differ from the slots gold charged.
//
// Ported from `measured.gold_slot_disagreements` (goal K), SPLIT: python reads
// gold, parses the graders' comments and maps each charge to slots; every
// question of whether a disagreement is DECLARED, OWNED or over BUDGET is here.
//
// REPORTED EVEN WHEN THE TOTAL AGREES -- especially then, because that is the
// case nothing else can see. Two slot errors can cancel to the same number.
//
// AN OPEN SUBGOAL IS A DECLARATION. A cell somebody is actively working does
// not also owe a table entry: the table says "we have decided to live with
// this" and a live subgoal says the opposite -- that the decision has not been
// made yet. Demanding both asks a cell's owner to declare it settled before
// they have settled it, and the honest answer then reads as an omission.
//
// THE DISTRIBUTION, NEVER A BARE SET. The stable set is a majority over pooled
// runs, and quoting it alone rounds each slot's majority up to certainty -- the
// same misreading as quoting a median alone.
//
// ORDER IS PART OF THE OUTPUT. A cell's mapping errors precede its unmapped or
// disagreement line, so the payload carries CELLS IN ITERATION ORDER rather
// than one list per arm. Splitting by arm reproduced every finding and put them
// in a different sequence, which a baseline diff reads as wholesale change.

/** python's `%g`. */
function g(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const s = Number(n.toPrecision(6)).toString();
  return s === '-0' ? '0' : s;
}
/** python's `repr` of a sorted list of strings. */
const pyList = (xs: readonly string[]): string =>
  '[' + xs.map(x => `'${x}'`).join(', ') + ']';

export type GoldSlotPayload = {
  /** In iteration order. See the note on ORDER above. */
  cells: Array<{
    item: string; pid: number;
    mappingErrors: Array<{ seg: string; hit: string[]; want: number; amt: number }>;
    unmapped: string[];
    disagreement: { charged: string[]; stable: string[];
                    counts: Record<string, number>; n: number } | null;
  }>;
  boundsMissed: Array<{ item: string; pid: number; missed: string[] }>;
  boundsCount: Array<{ item: string; pid: number; count: number; stable: string[] }>;
  codeDisagreements: Array<{ item: string; pid: number; code: string;
                             amt: number; ourAmt: number; candidates: string[] }>;
  seenDisagreeing: Array<[string, number]>;
  declared: { disagreements: Array<[string, number]>;
              unmappable: Array<[string, number]>;
              bounds: Array<[string, number]>;
              codes: Array<[string, number]> };
  owners: Record<string, boolean>;
  chargesItems: string[];
  budgets: { disagreements: number };
  /** `bounds_declarations_that_expired()`, appended verbatim. */
  expired: string[];
};

export function goldSlotDisagreements(p: GoldSlotPayload): string[] {
  const out: string[] = [];
  const key = (i: string, n: number) => `${i}|${n}`;
  const set = (xs: Array<[string, number]>) => new Set(xs.map(x => key(x[0], x[1])));
  const decl = {
    disagreements: set(p?.declared?.disagreements ?? []),
    unmappable: set(p?.declared?.unmappable ?? []),
    bounds: set(p?.declared?.bounds ?? []),
    codes: set(p?.declared?.codes ?? []),
  };
  const owned = (i: string, n: number) => Boolean(p?.owners?.[`${i}/p${n}`]);

  for (const c of p?.cells ?? []) {
    for (const me of c.mappingErrors ?? []) {
      // THE AMOUNT SAYS HOW MANY SLOTS THE CHARGE COVERS. A mismatch is a bug in
      // the phrase table, not in the scorer, and saying so is what keeps the
      // table honest.
      out.push(
        `${c.item}/p${c.pid}: the table maps "${me.seg}" to ` +
        `${pyList(me.hit)} worth ${g(me.want)}, but the grader charged ` +
        `${g(me.amt)} — the MAPPING is wrong, not the score`);
    }
    if (c.unmapped?.length) {
      if (!decl.unmappable.has(key(c.item, c.pid))) {
        out.push(
          `${c.item}/p${c.pid}: gold charges something the phrase table ` +
          `does not map — ${pyList(c.unmapped)}. Add it to GOLD_SLOT_CHARGES, ` +
          `or to GOLD_SLOT_UNMAPPABLE with the reason; an unread ` +
          `charge is not a passing cell`);
      }
      continue;
    }
    const d = c.disagreement;
    if (!d) continue;
    if (decl.disagreements.has(key(c.item, c.pid))) continue;
    if (owned(c.item, c.pid)) continue;
    const ch = new Set(d.charged);
    const st = new Set(d.stable);
    const union = [...new Set([...ch, ...st])].sort();
    const sym = union.filter(s => ch.has(s) !== st.has(s));
    const spread = union.map(s => `${s} ${d.counts?.[s] ?? 0}/${d.n}`).join(', ');
    out.push(
      `${c.item}/p${c.pid}: gold charges ${pyList([...ch].sort())}, we typically fail ` +
      `${pyList([...st].sort())} — differs on ${pyList(sym)} ` +
      `(pooled over ${d.n} runs: ${spread}). The TOTAL can still agree, ` +
      `which is how this stayed invisible. Declare it in ` +
      `GOLD_SLOT_DISAGREEMENTS_KNOWN with what is wrong, or fix it`);
  }

  // BOUNDED ACCOUNTING for the cells the exact comparison cannot read. Skipping
  // them was not accounting: 6 of 24 skipped cells disagreed on the TOTAL and
  // the check said nothing about any of them. Two statements survive ambiguity.
  for (const b of p?.boundsMissed ?? []) {
    if (decl.bounds.has(key(b.item, b.pid)) || owned(b.item, b.pid)) continue;
    out.push(
      `${b.item}/p${b.pid}: gold definitely charges ${pyList(b.missed)}, which we ` +
      `credit -- true on every reading of the ambiguous part of ` +
      `its comment. Declare it in GOLD_SLOT_BOUNDS_KNOWN or fix it`);
  }
  for (const b of p?.boundsCount ?? []) {
    if (decl.bounds.has(key(b.item, b.pid)) || owned(b.item, b.pid)) continue;
    out.push(
      `${b.item}/p${b.pid}: gold charges ${b.count} slot(s) and we fail ` +
      `${b.stable.length} (${pyList(b.stable)}). WHICH slots gold meant is ` +
      `ambiguous; the COUNT is not, so the two disagree on every ` +
      `reading. Declare it in GOLD_SLOT_BOUNDS_KNOWN or fix it`);
  }
  // CODE-LEVEL accounting for the criteria-derived items the slot comparison
  // refuses. Both sides charge exactly one code, so it is code against code.
  for (const cd of p?.codeDisagreements ?? []) {
    if (decl.codes.has(key(cd.item, cd.pid))) continue;
    out.push(
      `${cd.item}/p${cd.pid}: gold charges ${cd.code} (${g(cd.amt)}); we charge ` +
      `${g(cd.ourAmt)} (${cd.candidates.join(' or ')}). Both sides charge ONE code on ` +
      `this item, so the two disagree about WHICH judgement failed, not ` +
      `just by how much. Declare it in GOLD_CODE_KNOWN or fix it`);
  }

  // A DECLARATION THAT OUTLIVED ITS CELL, and the ratchet.
  const seen = set(p?.seenDisagreeing ?? []);
  const charges = new Set(p?.chargesItems ?? []);
  const live = (p?.declared?.disagreements ?? [])
    .filter(k => charges.has(k[0]) && !seen.has(key(k[0], k[1])))
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : (a[0] < b[0] ? -1 : 1)));
  for (const [item, pid] of live) {
    out.push(
      `GOLD_SLOT_DISAGREEMENTS_KNOWN names ${item}/p${pid}, but its slot set ` +
      `now MATCHES gold — drop the entry and lower the budget`);
  }
  const n = (p?.declared?.disagreements ?? []).length;
  const budget = p?.budgets?.disagreements ?? 0;
  if (n !== budget) {
    out.push(
      `GOLD_SLOT_DISAGREEMENTS_KNOWN ${n > budget ? 'grew to' : 'is down to'} ${n} ` +
      `against a budget of ${budget} -- it may only fall`);
  }
  return out.concat(p?.expired ?? []);
}
