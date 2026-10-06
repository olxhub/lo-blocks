// A `<Ref target="...">` in a prompt that the reconstruction cannot fill.
//
// Ported from `enforcement.check_ref_targets_resolve` (goal K).
//
// A REF WITH NO RECONSTRUCTED VALUE SCORES UNMET ON EVERY CELL, and does it
// quietly: the prompt still assembles, the model still answers, and the check
// it belongs to simply never finds the text it was meant to read. An empty
// value and an unresolvable one are the same thing to a grader.

export type RefTargetsPayload = {
  items: Array<{
    item: string;
    /** `<Ref target>` values in the action body, in first-seen order. */
    targets: string[];
    /** Box names the reconstruction produced for a real participant. */
    fixtureKeys: string[];
    /** Set when the reconstruction could not be built at all. */
    error?: string | null;
  }>;
};

export function refTargetsResolve(p: RefTargetsPayload): string[] {
  const out: string[] = [];
  for (const it of p.items ?? []) {
    if (it.error) {
      out.push(`${it.item}: cannot build a reconstruction — ${it.error}`);
      continue;
    }
    const have = new Set(it.fixtureKeys ?? []);
    for (const t of it.targets ?? []) {
      if (!have.has(t)) {
        out.push(
          `${it.item}: <Ref target="${t}"> has no reconstructed value, so the ` +
          `check scores unmet on every cell`);
      }
    }
  }
  return out;
}
