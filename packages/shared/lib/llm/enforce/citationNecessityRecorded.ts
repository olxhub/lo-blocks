// A cited participant nobody has asked whether the citation EARNS.
//
// Ported from `enforcement.check_citation_necessity_is_recorded` (goal K).
//
// THE PAIRED CHECK HOLDS REGISTRATION AND CITATION TOGETHER; neither direction
// asks whether the citation does work. A cell excluded on a citation that
// teaches nothing is a cell subtracted from every rate for no reason, and
// nothing about it ever looks wrong, because the cell scores fine.
//
// THE REAL TEST IS MEASUREMENT, not inspection -- rewrite the citation as the
// rule it illustrates, re-measure, see whether the cell still scores right --
// and that needs the corpus and an endpoint. What can be enforced is that the
// ANSWER WAS WRITTEN DOWN, so a registration cannot sit untested indefinitely
// while the guide claims the step was done.

export type CitationNecessityPayload = {
  /** `cited_participants` per handout: `{handout: {item: [pid, ...]}}`. */
  handouts: Record<string, Record<string, number[]>>;
  /** `CITATION_NECESSITY`, keyed `"<item>/<pid>"` -> state. */
  necessity: Record<string, string>;
};

const ALLOWED = new Set(['necessary', 'untested']);

export function citationNecessityRecorded(p: CitationNecessityPayload): string[] {
  const out: string[] = [];
  const necessity = p.necessity ?? {};
  const handouts = p.handouts ?? {};

  for (const h of Object.keys(handouts).sort((a, b) => Number(a) - Number(b))) {
    const cited = handouts[h] ?? {};
    for (const item of Object.keys(cited).sort()) {
      for (const pid of (cited[item] ?? []).slice().sort((a, b) => a - b)) {
        const state = necessity[`${item}/${pid}`];
        if (state === undefined) {
          out.push(
            `H${h} ${item}/p${pid} is registered in cited_participants with no ` +
            `CITATION_NECESSITY entry. Either measure whether the citation is ` +
            `load-bearing — rewrite it as its rule and re-run the cell — or ` +
            `record it as 'untested' so the backlog can see it`);
        } else if (!ALLOWED.has(state)) {
          out.push(
            `H${h} ${item}/p${pid}: CITATION_NECESSITY says ${pyRepr(state)}. ` +
            `Only 'necessary' and 'untested' belong here — a citation measured ` +
            `as unnecessary is REMOVED along with the registration, not recorded`);
        }
      }
    }
  }

  // AND THE OTHER DIRECTION: an entry for a cell nobody cites any more is a
  // record of a question about something that no longer exists.
  for (const key of Object.keys(necessity).sort()) {
    const cut = key.lastIndexOf('/');
    const item = key.slice(0, cut);
    const pid = Number(key.slice(cut + 1));
    const still = Object.values(handouts).some(
      cited => (cited[item] ?? []).includes(pid));
    if (!still) {
      out.push(
        `CITATION_NECESSITY lists ${item}/p${pid}, which is no longer ` +
        `registered in cited_participants. Remove it`);
    }
  }
  return out;
}

/** python's `repr` of the state string. */
function pyRepr(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/'/g, "\\'")}'`;
}
