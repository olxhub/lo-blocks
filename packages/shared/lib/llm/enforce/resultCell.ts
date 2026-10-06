// One `results[]` entry -> the cell it scored.
//
// Ported from `cross_path.result_cell` (goal K), and in ONE place here for the
// reason it is in one place there: the app stores `grader.score` as a FRACTION
// of `sheet_max` while every other writer stores absolute points. A second copy
// of that conversion is a second chance to forget the multiply, which would
// silently read every app cell as diverging.
//
// NULL ONLY WHEN THE ENTRY CANNOT BE KEYED AT ALL. A readable cell that simply
// has no score comes back with points null, because "this cell failed to score"
// and "this file has an entry I do not understand" are different facts and the
// callers treat them differently.

export type Cell = {
  item: string;
  pid: number;
  /** Absolute points, or null when the cell did not score. */
  points: number | null;
  verdicts: Record<string, string>;
};

export function resultCell(r: Record<string, unknown>): Cell | null {
  if ('cell' in r) {                                   // the app
    const cell = String(r.cell ?? '');
    if (!cell.includes('/')) return null;
    const cut = cell.indexOf('/');
    const pidS = cell.slice(0, cut);
    const item = cell.slice(cut + 1);
    const pid = Number.parseInt(pidS.replace(/^[pP]+/, ''), 10);
    if (!Number.isFinite(pid)) return null;
    const raw = ((r.grader ?? {}) as Record<string, unknown>).score;
    const mx = r.sheet_max;
    const points = raw === null || raw === undefined || mx === null || mx === undefined
      ? null : Number(raw) * Number(mx);
    return { item, pid, points, verdicts: { ...((r.verdicts ?? {}) as Record<string, string>) } };
  }
  if ('item_id' in r) {                                // the paper scorer
    const s = r.score;
    const verdicts: Record<string, string> = {};
    for (const c of ((r.credit_checks ?? []) as Array<Record<string, unknown>>)) {
      if (!c.what) continue;
      const v = String(c.verdict ?? '').trim();
      verdicts[String(c.what)] = v || (c.met ? 'met' : 'absent');
    }
    return {
      item: String(r.item_id),
      pid: (r._pid ?? null) as number,
      points: s === null || s === undefined ? null : Number(s),
      verdicts,
    };
  }
  const pid = r.participant_id;                        // the python harness
  if (pid === null || pid === undefined || !r.item) return null;
  const s = r.score;
  const ch = r.checks;
  return {
    item: String(r.item),
    pid: Number(pid),
    points: s === null || s === undefined ? null : Number(s),
    verdicts: (ch && typeof ch === 'object') ? { ...(ch as Record<string, string>) } : {},
  };
}
