// A rule the rubric generates that the shipped .olx does not carry.
//
// Ported from `enforcement.check_written_rules_reach_the_shipped_prompt`
// (goal K).
//
// A RECORDED NUMBER DESCRIBES THE PROMPT THAT WAS SENT. Edit the rubric and the
// assembler's output moves; until it is written into the handout and the idmap
// re-dumped, the shipped prompt is the old one -- and every recorded rate for
// that item is about a prompt the rubric has moved past. Nothing about the
// number looks stale.
//
// ONLY ITEMS WITH A NUMBER TO INVALIDATE. An item nobody has measured can drift
// freely; there is no result to be wrong about yet.
//
// WEB SIDES ONLY, and that is the correct reading rather than a convenience: a
// paper recording is not invalidated by the web prompt drifting, because the
// paper scorer never sees it. Measured when the gate was narrowed -- no item is
// recorded on paper alone, so the set is the same today and the intent is now
// explicit rather than incidental.
//
// NO UPPER BOUND ON LINE LENGTH. A rule is one line, and capping the scan at
// 130 characters silenced this check entirely.

export type WrittenRulesPayload = {
  /** item -> the prompt the rubric generates. */
  prompts: Record<string, string>;
  /** item -> the shipped handout source it must appear in. */
  shipped: Record<string, string>;
  /** Items carrying a recorded number on a WEB side. */
  recorded: string[];
};

export function writtenRulesReachTheShippedPrompt(p: WrittenRulesPayload): string[] {
  const out: string[] = [];
  const recorded = new Set(p?.recorded ?? []);
  for (const item of Object.keys(p?.prompts ?? {}).sort()) {
    if (!recorded.has(item)) continue;        // no number to invalidate
    const shipped = p.shipped?.[item];
    if (shipped === undefined) continue;      // sheet-only items and the like
    // LONG ENOUGH TO BE PROSE rather than markup, and never a `<Ref>`, whose
    // text the server substitutes per student.
    const missing = p.prompts[item].split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 40 && !l.includes('REF:') && !l.includes('<Ref'))
      .filter(l => !shipped.includes(l));
    if (!missing.length) continue;
    out.push(
      `${item}: the rubric generates ${missing.length} prompt line(s) the ` +
      `shipped .olx does not carry, so its recorded number describes a ` +
      `prompt the rubric has moved past. Deliver it with ` +
      '`npm run build:assemble-prompts -- --write`, re-dump the idmap, and sweep. ' +
      `First missing line: ${pyRepr(missing[0].slice(0, 90))}`);
  }
  return out;
}

/** Python's `repr()` for the line these findings quote. */
function pyRepr(s: string): string {
  const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  if (body.includes("'") && !body.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}
