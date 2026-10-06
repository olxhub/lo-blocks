// A cell claimed by two declaration tables that say OPPOSITE things.
//
// Ported from `enforcement.check_no_cell_is_both_corrected_and_declared`
// (goal K). The tables are course data and live in $COURSE_METADATA; the rule
// — that one cell may not be both corrected and diverged-from — is generic.
//
// THE TWO TABLES CONTRADICT EACH OTHER BY CONSTRUCTION. A correction says
// gold's number was WRONG, against the dictionary or the graders' own practice
// on comparable rows, so the target moves and the cell is scored against the
// corrected figure. A divergence says gold's number STANDS, that it is a
// coherent decision, and that we knowingly differ from it. Booking a cell in
// both counts one finding twice.

export type CorrectedEntry = { item: string; pid: number; was?: unknown; score?: unknown };
export type DivergenceEntry = { code?: string; cells: [string, number][] };

export function cellsBothCorrectedAndDeclared(
  p: { corrected: CorrectedEntry[]; divergences: DivergenceEntry[] },
): string[] {
  const declared = new Map<string, string[]>();
  for (const d of p?.divergences ?? []) {
    for (const cell of d?.cells ?? []) {
      const k = `${cell[0]}/${cell[1]}`;
      declared.set(k, [...(declared.get(k) ?? []), d?.code ?? ''].filter(Boolean));
    }
  }
  const out: string[] = [];
  for (const c of p?.corrected ?? []) {
    const k = `${c.item}/${c.pid}`;
    if (!declared.has(k)) continue;
    const codes = JSON.stringify([...(declared.get(k) ?? [])].sort());
    out.push(
      `${c.item}/p${c.pid} is CORRECTED (${c.was} -> ${c.score}) and also ` +
      `DECLARED in ${codes}. Those tables contradict each other: a correction ` +
      `says gold's number was wrong, a divergence says it stands and we differ ` +
      `from it knowingly. Keep ONE -- drop the cell from the declaration, or ` +
      `revert the correction -- because booking it twice counts one finding twice`);
  }
  return out.sort();
}
