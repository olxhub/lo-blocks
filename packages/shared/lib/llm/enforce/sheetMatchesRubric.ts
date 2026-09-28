// Each `<LLMAction rubricDef=>` names a rubric entry, and the two agree.
//
// Ported from `enforcement.check_sheet_matches_the_rubric_it_names` (goal K).
//
// The generated sheet and the rubric component are TWO PROJECTIONS of one
// definition. The attribute names the source so a consumer can DERIVE its own
// projection instead of restating it -- and this is the consumer that makes the
// naming worth anything: it compares the two slot-key sets and reports a
// divergence rather than letting two descriptions of one rule drift in silence.
//
// A SKIP IS NOT A PASS, and the first version of this check was proof. It named
// a symbol that lives in another module, every item raised, a bare
// `except: continue` swallowed it, and the check reported 0 findings while
// comparing NOTHING -- two injected failures both came back clean. So an item
// whose action cannot be loaded arrives as an ERROR and is reported, because
// the alternative is a check that cannot fail. The same is true one level up:
// an UNSTAGED rubric is a finding, not a skip, since an unbuilt artifact is not
// evidence that the sheet and the rubric agree.

export type SheetRubricPayload = {
  /** Set when the rubric component could not be loaded at all. */
  rubricError?: { kind: 'unstaged' | 'unparsable' | 'unreachable';
                  detail: string } | null;
  items: Array<{
    item: string;
    /** The action could not be loaded; python's message for it. */
    error?: string | null;
    /** The `rubricDef=` attribute, empty when the sheet names none. */
    rubricDef?: string | null;
    /** True when the named entry exists in the staged rubric. */
    entryExists?: boolean;
    /** Slot keys the SHEET describes. */
    sheetKeys?: string[];
    /** Slot keys the RUBRIC entry describes. */
    rubricKeys?: string[];
  }>;
};

const pyList = (xs: string[]): string =>
  '[' + xs.map(x => `'${x}'`).join(', ') + ']';

export function sheetMatchesRubric(p: SheetRubricPayload): string[] {
  const out: string[] = [];
  if (p?.rubricError) {
    return [p.rubricError.detail];
  }
  for (const it of p?.items ?? []) {
    if (it.error) {
      out.push(`${it.item}: cannot load its action to compare against the ` +
               `rubric: ${it.error}`);
      continue;
    }
    if (!it.rubricDef) {
      out.push(`${it.item}: its <LLMAction> names no rubricDef, so nothing ` +
               `ties the sheet to a rubric entry`);
      continue;
    }
    if (!it.entryExists) {
      out.push(`${it.item}: rubricDef='${it.rubricDef}' names no <Item> in the ` +
               `staged rubric -- the sheet points at nothing`);
      continue;
    }
    const sheet = new Set(it.sheetKeys ?? []);
    const declared = new Set(it.rubricKeys ?? []);
    // BOTH MUST BE NON-EMPTY before a difference means anything: an empty side
    // is an absent projection, not a disagreeing one.
    if (sheet.size && declared.size) {
      const onlySheet = [...sheet].filter(k => !declared.has(k)).sort();
      const onlyRubric = [...declared].filter(k => !sheet.has(k)).sort();
      if (onlySheet.length || onlyRubric.length) {
        out.push(
          `${it.item}: the sheet and rubric entry '${it.rubricDef}' describe different ` +
          `slots -- sheet only ${pyList(onlySheet)}, rubric only ${pyList(onlyRubric)}`);
      }
    }
  }
  return out;
}
