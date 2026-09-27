// Is the rubric's carried commentary still all there?
//
// Ported from `enforcement.check_carried_notes_are_intact` (goal K). Generic:
// "a recorded block of reasoning has shrunk or vanished" is a comparison of two
// counts, and the tags are whatever the course wrote.
//
// THESE ARE COMMENTS, and that is the whole difficulty. `<!-- carried:TAG k/n -->`
// blocks are stripped before anything parses the rubric, so they cannot reach a
// prompt, a score or a rendered page however wrong they get -- which also means
// NOTHING ELSE WOULD EVER REPORT THEM. A marker that stops matching does not
// error; it reads exactly like prose nobody wrote.
//
// SHRINKAGE ONLY. A block count that GREW is not a finding: notes get added.
// The check fires on a tag that lost blocks or lines, or lost all of them.

export type CarriedNotesPayload = {
  /** What the rubric carries now: tag -> blocks, each block a list of lines. */
  got: Record<string, string[][]>;
  /** What it carried when recorded: tag -> [blocks, lines]. */
  want: Record<string, [number, number]>;
};

export function carriedNotesAreIntact(p: CarriedNotesPayload): string[] {
  const got = p?.got ?? {};
  const want = p?.want ?? {};
  const out: string[] = [];
  // SORTED BY TAG, as python's `sorted(want.items())` is -- the finding ORDER
  // is part of what a baseline diff compares.
  for (const tag of Object.keys(want).sort()) {
    const [runs, lines] = want[tag];
    const rs = got[tag];
    if (!rs || rs.length === 0) {
      out.push(
        `${tag} carried ${runs} block(s) of recorded reasoning and ` +
        `now carries NONE. These are comments in the rubric ` +
        `(\`<!-- carried:${tag} k/n -->\`); a marker that stops ` +
        `matching reads exactly like prose nobody wrote`);
      continue;
    }
    const haveLines = rs.reduce((n, r) => n + r.length, 0);
    if (rs.length < runs || haveLines < lines) {
      out.push(
        `${tag} carried ${runs} block(s)/${lines} line(s) and now has ` +
        `${rs.length}/${haveLines}. A block a later one assumes is ` +
        `gone, and nothing else would report it`);
    }
  }
  return out;
}

/** The `<!-- carried:TAG k/n -->` blocks, exactly python's `_CARRIED` walk. */
export function parseCarried(raw: string): Record<string, string[][]> {
  const re = /<!--\s*carried:(\S+)\s+(\d+)\/(\d+)\s*\n([\s\S]*?)\n\s*-->/g;
  const acc: Record<string, Array<[number, string[]]>> = {};
  for (const m of raw.matchAll(re)) {
    // READ FROM THE RAW FILE, not a parsed tree: the comment stripper runs
    // before any parse, so a tree cannot see these at all.
    const lines = m[4].split('\n').map(ln => (ln.startsWith('  ') ? ln.slice(2) : ln));
    (acc[m[1]] ??= []).push([Number(m[2]), lines]);
  }
  const out: Record<string, string[][]> = {};
  // BY BLOCK INDEX `k`, which is content and not formatting: a later block
  // often assumes an earlier one, so the order is what lets a reader be told
  // "block 3 of 7" rather than handed the lines undifferentiated.
  for (const [tag, rs] of Object.entries(acc)) {
    out[tag] = rs.sort((a, b) => a[0] - b[0]).map(r => r[1]);
  }
  return out;
}
