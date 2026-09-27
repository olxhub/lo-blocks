// Does a declared prompt deviation still have something to deviate from?
//
// Ported from `enforcement.check_prompt_deviation_tables_are_current` (goal K).
//
// A deviation table says "for THIS item, the generator departs from the usual
// rendering". An entry whose item was renamed or dropped, or whose target line
// has left the rubric, is a silence nobody revisits: the omission outlives the
// thing it omits and the next reader cannot tell a live exception from a dead
// one.
//
// `_`-PREFIXED KEYS ARE NOT ITEMS. `CONTEXT` carries a handout's section
// headings alongside its items -- `_utb`, `_wgb` -- because a section is not an
// item and an item entry is the wrong home for one. They are skipped rather
// than reported as dangling.

export type DeviationPayload = {
  /** Every live item id: `ACTION` plus `SHEET_ONLY`. */
  items: string[];
  /** Each deviation table, by the name the finding prints. */
  tables: Record<string, Record<string, unknown>>;
  /** Per item: the guidance prose, credit slot names, deduction codes. */
  rubric: Record<string, { guidance: string; credit: string[]; deductions: string[] }>;
};

const TABLES = ['RESPONSE', 'CONTEXT', 'ITEM_NOTES', 'OMIT_CREDIT',
                'OMIT_DEDUCTION', 'OMIT_GUIDANCE'];

/** Python's `repr` for a plain string key. */
function q(s: string): string { return `'${s.replace(/'/g, "\\'")}'`; }

export function promptDeviationTablesAreCurrent(p: DeviationPayload): string[] {
  const items = new Set(p?.items ?? []);
  const out: string[] = [];
  for (const name of TABLES) {
    for (const key of Object.keys(p.tables?.[name] ?? {}).sort()) {
      if (key.startsWith('_')) continue;
      if (!items.has(key)) {
        out.push(
          `olx_prompts.${name} declares a deviation for ${q(key)}, which ` +
          `is not a live item -- the item was renamed or dropped and ` +
          `its deviation was not`);
      }
    }
  }
  // EACH ENTRY IS A MAP OF phrase -> REASON, not a list of phrases. python's
  // `sorted(omitted)` yields the KEYS; spreading the object instead yields
  // nothing iterable at all, which is how this first came back as a TypeError
  // rather than a wrong answer.
  const omitG = (p.tables?.OMIT_GUIDANCE ?? {}) as Record<string, Record<string, string>>;
  for (const item of Object.keys(omitG).sort()) {
    if (!items.has(item)) continue;
    const guidance = p.rubric?.[item]?.guidance ?? '';
    for (const phrase of Object.keys(omitG[item] ?? {}).sort()) {
      if (!guidance.includes(phrase)) {
        out.push(
          `olx_prompts.OMIT_GUIDANCE[${q(item)}] omits ` +
          `"${phrase.slice(0, 48)}", which is no longer in that item's ` +
          `guidance. The omission outlived the line it omits`);
      }
    }
  }
  for (const [name, field] of [['OMIT_CREDIT', 'credit'],
                               ['OMIT_DEDUCTION', 'deductions']] as const) {
    const tbl = (p.tables?.[name] ?? {}) as Record<string, Record<string, string>>;
    for (const item of Object.keys(tbl).sort()) {
      if (!items.has(item)) continue;
      const have = new Set(p.rubric?.[item]?.[field] ?? []);
      for (const key of Object.keys(tbl[item] ?? {}).sort()) {
        if (!have.has(key)) {
          out.push(
            `olx_prompts.${name}[${q(item)}] omits ${q(key)}, which the ` +
            `rubric no longer has -- the omission outlived its target`);
        }
      }
    }
  }
  return out;
}
