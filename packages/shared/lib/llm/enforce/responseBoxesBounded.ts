// Are the student's boxes DELIMITED in the prompt the grader is sent?
//
// Ported from the structural half of `enforcement.check_empty_fields_are_absent`
// (goal K), which was split because the other half exercises a python-side
// normaliser with no counterpart here -- the user's rule: something that
// touches both sides should be split.
//
// AN EMPTY BOX'S `<Ref>` RENDERS TO NOTHING, and for the LAST box on an item
// there was no following heading to bound it -- so the guidance the app appends
// after the prompt fell exactly where the box's contents belong, and was quoted
// back to the student as their own words. On one three-pass sweep that was the
// string "WRITING TO THE STUDENT", a heading out of the prompt itself,
// reproduced as a student's answer six times across five cells.
//
// TWO INSTRUCTION-LEVEL FIXES WERE MEASURED AND NEITHER MOVED THE RATE. The
// BOUNDS are what fixed it, so the bounds are what this checks -- every item on
// every handout, because the last box of any item is the one exposed.

export type ResponseBoxesPayload = {
  /** item -> the full runtime prompt, for every item that shows its boxes. */
  prompts: Record<string, string>;
};

const HEAD = '## Student response to grade';
const END = '## End of the student response';

export function responseBoxesAreBounded(p: ResponseBoxesPayload): string[] {
  const out: string[] = [];
  for (const item of Object.keys(p?.prompts ?? {}).sort()) {
    const prompt = p.prompts[item] ?? '';
    const at = prompt.indexOf(HEAD);
    if (at < 0) continue;
    const body = prompt.slice(at + HEAD.length);
    const opens = body.split('[box begins]').length - 1;
    const closes = body.split('[box ends]').length - 1;
    if (opens === 0) {
      out.push(
        `${item}: the student's boxes are not delimited -- ` +
        `an empty box renders as nothing, and for the LAST box the ` +
        `guidance the app appends lands where its contents would be`);
    } else if (opens !== closes) {
      out.push(
        `${item}: ${opens} \`[box begins]\` against ${closes} ` +
        `\`[box ends]\` -- an unclosed box swallows whatever follows it`);
    }
    if (!body.includes(END)) {
      out.push(
        `${item}: the response section is not closed, so ` +
        `nothing separates the last box from the appended guidance`);
    }
  }
  return out;
}
