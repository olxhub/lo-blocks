// Rules about the course's own declaration tables.
//
// Goal K. The tables are course data and live in $COURSE_METADATA; the rules
// about their SHAPE — one correction per box, every named target still exists —
// are generic for any course that declares them.

/** `CONSENSUS_FIXES[(item,pid)]` = a list of fixes, applied IN ORDER. */
export type FixList = { item: string; pid: number; fixes: string[][] };

/**
 * A box corrected twice, where the later correction silently wins.
 *
 * `agreement_app.CONSENSUS_FIXES` applies its entries in order, so a second fix
 * naming the same box overwrites the first. p9's corrected assignments were
 * prepended to its existing trims and clobbered by them, and the tail recovery
 * then dropped the orphaned sentence into the wrong box.
 */
export function consensusFixesAreUnique(p: { entries: FixList[] }): string[] {
  const out: string[] = [];
  for (const e of p?.entries ?? []) {
    const seen = new Map<string, string>();
    for (const fix of e.fixes ?? []) {
      // A `swap` names TWO boxes; every other kind names one. Reading only the
      // first would miss a swap clobbering a box it shares with a later trim.
      const boxes = fix[0] === 'swap' ? fix.slice(1) : fix.slice(1, 2);
      for (const box of boxes) {
        if (seen.has(box)) {
          out.push(
            `CONSENSUS_FIXES[${JSON.stringify(e.item)}, ${e.pid}] fixes ` +
            `\`${box}\` twice (${seen.get(box)} then ${fix[0]}) — the later one ` +
            `silently wins. State a single span per box`);
        }
        seen.set(box, fix[0]);
      }
    }
  }
  return out;
}

export type NamedFixture = { label: string; item: string; why: string };

/**
 * A fixture naming a target the course no longer has, or naming one with no reason.
 *
 * A fixture naming a target stops testing anything the day that target changes,
 * and says nothing about it: the case injects into nothing and reports PASS.
 */
export function namedFixturesStillNameSomething(
  p: { fixtures: NamedFixture[]; knownItems: string[] },
): string[] {
  const known = new Set(p?.knownItems ?? []);
  const out: string[] = [];
  for (const f of [...(p?.fixtures ?? [])].sort(
    (a, b) => (a.label + a.item).localeCompare(b.label + b.item))) {
    if (!known.has(f.item)) {
      out.push(
        `the fixture ${JSON.stringify(f.label)} names item ` +
        `${JSON.stringify(f.item)}, which this course no longer has -- the ` +
        `case is injecting into nothing and would report PASS for it`);
    }
    if (!String(f.why ?? '').trim()) {
      out.push(
        `the fixture ${JSON.stringify(f.label)} names ` +
        `${JSON.stringify(f.item)} with no reason given; a named target ` +
        `without a justification is the thing D2a set out to remove`);
    }
  }
  return out;
}
