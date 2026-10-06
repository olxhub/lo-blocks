// Does the RUNTIME understand `key->verdict`, and `maps`, too?
//
// Ported from `enforcement.check_fails_verdict_is_mirrored_in_the_app` (goal K).
//
// THREE IMPLEMENTATIONS PARSE THESE ATTRIBUTES: python's `score.py`, python's
// `agreement.py`, and this package's `slotSheet.ts` -- the one students meet. A
// syntax the first two understand and the third does not is WORSE than a syntax
// nobody understands, because the arrow becomes part of the KEY: nothing matches
// a slot called `behavior_1->not_active`, so the check it names is never
// computed, never charged, and nothing reports it.
//
// IT CHECKS THE SOURCE rather than running the parser. The mirror is a fact
// about the file, and the suite already exercises the behaviour -- this asks the
// different question of whether the wiring is still THERE.
//
// PORTING IT MOVED THE READER TO THE RIGHT SIDE. Python read `paths.SLOTSHEET_TS`
// across the repo boundary to grep an engine file for engine function names,
// which is the cross-repo coupling this goal exists to remove. The file is this
// package's own; the check on it belongs here.

export type RuntimeMirrorPayload = {
  /** The slot-sheet source, and the name to use in messages. */
  name: string;
  src: string;
};

export function runtimeParsesFailsVerdict(p: RuntimeMirrorPayload): string[] {
  const name = p?.name ?? 'slotSheet.ts';
  const src = p?.src ?? '';
  const out: string[] = [];

  // `maps` IS THE FOURTH COMPUTED PRIMITIVE and the runtime must parse it too:
  // a `maps` attribute the app ignores means the check it names is never
  // computed there, so the app credits a slot both harnesses refuse.
  for (const fn of ['parseMaps', 'mappedVerdict']) {
    if (!src.includes(`export function ${fn}(`)) {
      out.push(
        `${name} has no ${fn}: the \`maps\` primitive is declared in ` +
        `primitives.json and computed by both python engines, so the ` +
        `app would ignore the attribute and credit a check they ` +
        `refuse`);
    }
  }
  if (!src.includes('for (const r of maps)')) {
    out.push(
      `${name}:satisfiedMap does not apply \`maps\`, so a mapped check ` +
      `is parsed there and never computed`);
  }
  // RETURNS EARLY. With no `splitFailsVerdict` at all, the per-caller findings
  // below are a hundred ways of saying the same thing once.
  if (!src.includes('splitFailsVerdict')) {
    out.push(
      `${name} has no splitFailsVerdict: the app would read the ` +
      `arrow as part of the key, so a rule written ` +
      `\`behavior_1->not_active\` would compute NOTHING there while ` +
      `both python engines honoured it`);
    return out;
  }
  for (const fn of ['parseForbid', 'parseExpect']) {
    const i = src.indexOf(`export function ${fn}(`);
    if (i < 0) {
      out.push(`${name} has no ${fn} -- retarget this check`);
      continue;
    }
    const j = src.indexOf('\nexport ', i + 1);
    const body = j > 0 ? src.slice(i, j) : src.slice(i);
    if (!body.includes('splitFailsVerdict')) {
      out.push(
        `${name}:${fn} does not call splitFailsVerdict, so a ` +
        `\`key->verdict\` rule parsed there keeps the arrow in its ` +
        `key and silently computes nothing`);
    }
  }
  return out;
}
