// The paper grader told to read a BOX it does not have.
//
// Ported from `enforcement.check_paper_prompt_has_no_box_deixis` (goal K).
//
// THE WEB HAS BOXES AND THE PAPER SCORER DOES NOT, BY DESIGN: a paper
// submission arrives as one block. Deixis that points at a box -- "a box", "all
// three boxes", "the type box" -- tells the grader to look somewhere that does
// not exist, and it answers about whatever it finds instead.
//
// AND A COUNT PHRASE CAN POINT OUTSIDE THE STRUCTURE TOO. "both answers" on an
// item that asks for one is not a translation problem; the phrase has to be
// REWORDED, because there is no second answer for it to mean.

export type PaperDeixisPayload = {
  items: Array<{
    /** The item id, as the finding names it. */
    item: string;
    /** The shipped paper prompt, assembled by python's paper generator. */
    prompt: string;
    /** How many answers this item actually asks for. */
    answers: number;
  }>;
};

const COUNT_WORDS: ReadonlyArray<[string, number]> = [
  ['both', 2], ['all three', 3], ['all four', 4],
  ['the two', 2], ['the three', 3], ['the four', 4],
];

export function paperPromptBoxDeixis(p: PaperDeixisPayload): string[] {
  const out: string[] = [];
  for (const it of p.items ?? []) {
    const prompt = String(it.prompt ?? '');
    for (const m of prompt.matchAll(/\bboxe?s?\b/gi)) {
      const s = Math.max(0, (m.index ?? 0) - 70);
      const e = Math.min(prompt.length, (m.index ?? 0) + m[0].length + 70);
      out.push(
        `${it.item}: the paper prompt says ${pyRepr(m[0])} -- it has no boxes: ` +
        `…${squash(prompt.slice(s, e))}…`);
    }
    const nAnswers = it.answers ?? 0;
    if (!nAnswers) continue;
    for (const [word, k] of COUNT_WORDS) {
      const re = new RegExp(`\\b${word}\\b(?:\\s+\\w+){0,2}\\s+answers\\b`, 'gi');
      for (const m of prompt.matchAll(re)) {
        if (k <= nAnswers) continue;
        const s = Math.max(0, (m.index ?? 0) - 70);
        out.push(
          `${it.item}: the prompt says ${pyRepr(m[0])} but the item asks for ` +
          `${nAnswers} answer(s) -- the phrase points outside the structure and ` +
          `needs rewording, not translating: ` +
          `…${squash(prompt.slice(s, (m.index ?? 0) + m[0].length + 60))}…`);
      }
    }
  }
  return out;
}

/** python's `' '.join(text.split())`: collapse every run of whitespace. */
function squash(s: string): string {
  return s.split(/\s+/).filter(Boolean).join(' ');
}

/** python's `repr` for the matched word. */
function pyRepr(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/'/g, "\\'")}'`;
}
