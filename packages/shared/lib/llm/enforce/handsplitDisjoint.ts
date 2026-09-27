// Do two boxes of one hand-split row hold the same sentence?
//
// Ported from `enforcement.check_handsplit_rows_are_disjoint` (goal K). Python
// fetches the hand-split tables -- they are source documents, read-only, and
// knowing where they live is python's half -- and the judgement lives here.
//
// WHAT A HIT MEANS. The hand split apportions a student's answer into the boxes
// a form asks for. If one box's text is CONTAINED in another's, the same
// sentence is in two places, so at least one box is showing the grader text the
// student did not put there -- and the cell is then scored against a fixture
// that misrepresents the answer. This project has already recorded that reading
// a cell's boxes out finds what no check can; this is the containment half of
// that, which a check CAN see.
//
// CONTAINMENT, NOT EQUALITY, and that is the point: an exact duplicate is the
// easy case. The damaging one is a box holding a sentence plus a fragment of
// its neighbour, which equality never catches.
//
// GENERIC BY THE PROJECT'S OWN TEST: "two boxes of one response should not
// contain each other" assumes nothing about what the form asks.

export type HandsplitRow = { pid: string | number; fields: Record<string, unknown> };
export type HandsplitTable = {
  /** The file's basename, so a finding names what the reader will open. */
  name: string;
  rows?: HandsplitRow[];
  /** Set when python could not read the table at all. */
  error?: string;
};

/**
 * The python normalisation, step for step.
 *
 * The curly apostrophe is folded first because the submissions carry both and a
 * box differing only in that character is the same sentence. Then whitespace is
 * collapsed, a trailing period dropped, and the whole lowercased -- so the
 * comparison is about words, not typography.
 */
function norm(v: unknown): string {
  return String(v ?? '')
    .replace(/’/g, "'")
    .split(/\s+/).filter(Boolean).join(' ')
    .trim()
    .replace(/\.+$/, '')
    .toLowerCase();
}

export function handsplitRowsAreDisjoint(p: { tables: HandsplitTable[] }): string[] {
  const problems: string[] = [];
  for (const table of p?.tables ?? []) {
    const name = table?.name ?? '';
    if (table?.error !== undefined && table?.error !== null) {
      problems.push(`${name} could not be read: ${table.error}`);
      continue;
    }
    // Python sorts the table's keys AS STRINGS, so p10 precedes p9.
    const rows = [...(table.rows ?? [])].sort((a, b) =>
      String(a.pid) < String(b.pid) ? -1 : String(a.pid) > String(b.pid) ? 1 : 0);
    for (const { pid, fields } of rows) {
      if (!fields || typeof fields !== 'object') continue;
      const n: Record<string, string> = {};
      for (const [f, v] of Object.entries(fields)) n[f] = norm(v);
      const names = Object.keys(n).filter(f => n[f]).sort();
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = names[i], b = names[j];
          const va = n[a], vb = n[b];
          if (!(va.includes(vb) || vb.includes(va))) continue;
          // On equal lengths python takes the ELSE branch, making the SECOND
          // field the small one. Kept, so the finding reads identically.
          const [small, big] = va.length < vb.length ? [a, b] : [b, a];
          problems.push(
            `${name} p${pid}: \`${small}\` is contained in \`${big}\` — the `
            + `same sentence is in two boxes, so one of them shows the `
            + `model text the student did not put there`);
        }
      }
    }
  }
  return problems;
}
