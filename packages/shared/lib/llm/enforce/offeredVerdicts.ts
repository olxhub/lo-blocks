// Does any prompt prose tell the grader to answer a verdict its slot lacks?
//
// Ported from `enforcement.check_prompt_prose_names_only_offered_verdicts`
// (goal K). Python resolves the slots, the `choices=` map, the notes and the
// rubric; this decides. The resolution has to stay on the python side for now
// because SLOT_NOTES and the rubric's `credit` list are still python-side
// views, but the JUDGEMENT — which tokens a slot offers, and on which side —
// is content reasoning and belongs here.
//
// WHY IT MATTERS. A note that names a token the slot does not offer is an
// INERT TEST: the model is asked for an answer it cannot give, so it answers
// something else and the distinction the note exists to draw is never drawn.
// Q5:example_2 sat in the live web prompt naming `not_reason` while its sheet
// offered `wrong_kind`. It dated to the original import and was found by
// reading, not by any check.

/** One slot, with everything the rule needs to judge its prose. */
export type SlotProse = {
  item: string;
  key: string;
  /** The rubric's shared `rule` owns this slot; a different check polices it. */
  hasRule: boolean;
  /** What the WEB sheet offers, `pick(group)` options already resolved. */
  offered: string[];
  /** What the PAPER side offers for the same slot. */
  offeredPaper: string[];
  /** The olx-only SLOT_NOTES text reaching this slot, if any. */
  note?: string | null;
  /** The credit component's `desc`, which reaches BOTH prompts. */
  desc?: string | null;
};

export type OfferedVerdictsPayload = {
  knownVerdicts: string[];
  slots: SlotProse[];
};

/** Verdict tokens named in backticks, the way prose names one. */
function namedIn(text: string, known: string[]): string[] {
  return known.filter(v => text.includes('`' + v + '`')).sort();
}

const fmt = (xs: string[]) => `[${xs.map(x => `'${x}'`).join(', ')}]`;

export function promptProseNamesOnlyOfferedVerdicts(
  p: OfferedVerdictsPayload,
): string[] {
  const known = p?.knownVerdicts ?? [];
  const out: string[] = [];
  for (const s of p?.slots ?? []) {
    // `rule` WINS. Its `{fail}` substitution is a different mechanism with its
    // own check; judging it here would report the same slot twice under two
    // rules that disagree about what it is allowed to say.
    if (s.hasRule) continue;
    const offered = new Set(s.offered ?? []);

    if (s.note) {
      // A SLOT_NOTES ENTRY IS OLX-ONLY, so the test is against what the WEB
      // slot offers: it is the only side that will ever be handed it.
      const missing = namedIn(s.note, known).filter(v => !offered.has(v));
      if (missing.length) {
        out.push(
          `${s.item}.${s.key}: the prompt prose tells the model to answer ` +
          `${fmt(missing)}, which this slot does not offer -- it offers ` +
          `${fmt([...offered].sort())}. The test is inert: the model cannot ` +
          `return that token, so it answers something else and the ` +
          `distinction is lost. Move the text to the rubric's \`rule\` and use ` +
          `\`{fail}\`, or name a verdict the slot has`);
      }
      continue;
    }

    // THE THIRD PROSE SOURCE, and it reaches BOTH scorers. With no `rule` and
    // no note the web falls through to the credit component's `desc`, and the
    // paper scorer uses that same `desc` as its body — so the test is the
    // SHARED one: a token only one side offers is wrong on the other.
    if (!s.desc) continue;
    const paper = new Set(s.offeredPaper ?? []);
    const bad = namedIn(s.desc, known)
      .filter(v => !paper.has(v) || !offered.has(v));
    if (bad.length) {
      out.push(
        `${s.item}.${s.key}: the credit component's \`desc\` names the verdict ` +
        `${fmt(bad)} literally, and \`desc\` is rendered into BOTH prompts when ` +
        `the slot has no \`rule\` and no note. This slot does not offer it on ` +
        `both sides -- web ${fmt([...offered].sort())}, paper ` +
        `${fmt([...paper].sort())}. Use \`{fail}\` in a \`rule\`, or name only ` +
        `verdicts this slot offers on both`);
    }
  }
  return out;
}
