// Does the text in each box make sense in the light of gold's comment?
//
// Ported from `enforcement.check_fixture_agrees_with_gold` (goal K).
//
// THE GRADERS READ THE WHOLE RESPONSE, so their wording says whether an element
// was THERE. Two families of phrase imply opposite things about the fixture:
//
//   "did not state" / "missing" / "never"   -> nothing was written, so the box
//                                              should be EMPTY.
//   "is not the same" / "does not match"    -> something WAS written and is
//                                              wrong, so the box should be FULL.
//
// A disagreement means the box holds the wrong clause -- or that gold's comment
// is about something else, which is what the override table is for.
//
// AN ABSENT CLAIM MUST NAME THE ELEMENT WITHIN ITS OWN CLAUSE. Looking back
// into the previous sentence matched one cell's `state_a2` against "did not
// state a second consequence", because the word "antecedent" happened to sit in
// the charge before it. A WRONG claim may name the element ahead of the phrase
// ("second consequence is not the same"), so it keeps a short lookback.
//
// "DID NOT SAY HOW / WHY" IS A JUDGEMENT, not an absence: it says what the
// student wrote is INADEQUATE. Those boxes rightly hold the text gold charges.

export type FixtureGoldPayload = {
  cells: Array<{ h: number; item: string; pid: number; boxes: Record<string, string> }>;
  /** `<handout>|<pid>|<item>` -> the grader's feedback. */
  feedback: Record<string, string>;
  /** item -> box -> the words gold uses for it (and words that rule it out). */
  boxWords: Record<string, Record<string, { want: string[]; forbid: string[] }>>;
  /** `<item>|<pid>|<box>` -> why the disagreement is declared acceptable. */
  overrides: Record<string, string>;
};

const ABSENT = /(?:did not (?:state|address|say|provide|list|clarify)|missing|never)[^.]{0,90}/g;
const WRONG = /(?:is not the same|does not match|not the same|a different)[^.]{0,90}/g;

export function fixtureAgreesWithGold(p: FixtureGoldPayload): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const overrides = p?.overrides ?? {};

  for (const cell of p?.cells ?? []) {
    const fb = String(p.feedback?.[`${cell.h}|${cell.pid}|${cell.item}`] ?? '')
      .split(/\s+/).filter(Boolean).join(' ').toLowerCase();
    if (!fb) continue;
    // NO ENTRY FALLS BACK TO THE BOX'S OWN NAME, which is what an item whose
    // boxes are already named the way gold names them wants.
    const named = p.boxWords?.[cell.item]
      ?? Object.fromEntries(Object.keys(cell.boxes)
        .map(k => [k, { want: [k.split('_').join(' ')], forbid: [] }]));

    for (const box of Object.keys(named)) {
      if (!(box in cell.boxes)) continue;
      const filled = Boolean((cell.boxes[box] ?? '').trim());
      const { want, forbid } = named[box];
      let done = false;
      for (const [re, wantFilled] of [[ABSENT, false], [WRONG, true]] as const) {
        if (done) break;
        re.lastIndex = 0;
        for (const m of fb.matchAll(re)) {
          const frag = wantFilled
            ? fb.slice(Math.max(0, m.index! - 60), m.index! + m[0].length)
            : m[0];
          if (!(want ?? []).every(w => frag.includes(w))) continue;
          if ((forbid ?? []).some(w => frag.includes(w))) continue;
          if (!wantFilled && (frag.includes('how') || frag.includes('why')
              || frag.includes('clarify') || frag.includes('being affected'))) {
            continue;
          }
          if (filled === wantFilled) continue;
          const key = `${cell.item}|${cell.pid}|${box}`;
          if (key in overrides) { seen.add(key); done = true; break; }
          out.push(
            `${cell.item}/p${cell.pid} \`${box}\` is `
            + (wantFilled
               ? 'EMPTY but gold marked it wrong rather than absent'
               : 'filled but gold says it was never written')
            + ` (${clip(m[0])}...) \u2014 either the box has the `
            + `wrong clause, or declare it in FIXTURE_GOLD_OVERRIDES`);
          done = true;
          break;
        }
      }
    }
  }
  for (const key of Object.keys(overrides).sort()) {
    if (seen.has(key)) continue;
    const [item, pid, box] = key.split('|');
    out.push(`FIXTURE_GOLD_OVERRIDES lists ('${item}', ${pid}, '${box}'), which no longer `
             + `disagrees. Remove it`);
  }
  return out;
}

/** Python's `x[:52]!r`. */
function clip(s: string): string {
  const body = s.slice(0, 52).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  if (body.includes("'") && !body.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}
