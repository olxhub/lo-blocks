// Can `promptAssembler` reproduce the prompt bodies that SHIP?
//
// The two assemblers are the designed producer for these bodies and have never
// had a caller outside their own tests; `olx_prompts.py` is what actually writes
// them. This script is the measurement that has to come before replacing one with
// the other -- it assembles every item and diffs against the generator's own
// output, so a difference is a difference in bytes rather than in opinion.
//
// WHAT IT IS GIVEN comes from `olx_prompts.py --assembler-inputs`, which reads the
// same sources `build_web_prompt` reads. Its `expected` field is the generator's
// output, and `--check` reports the handouts up to date, so `expected` is what
// ships. FRAGMENTS are the exception and are named in the report: they are prose
// the rubric does not yet carry, which is the next piece of work rather than a
// property of the assembler.
import { readFileSync } from 'node:fs'
import { assembleBodyPrefix, assembleChecklist, assembleContextAndResponse }
  from '../lib/llm/promptAssembler'

// NAMED, not asserted. `process.env.X!` made an unset variable arrive at
// readFileSync as `undefined`, which throws ERR_INVALID_ARG_TYPE and names the
// node internals rather than the thing the caller forgot to do.
const inputsPath = process.env.ASSEMBLER_INPUTS
if (!inputsPath) {
  console.error('ASSEMBLER_INPUTS is not set. Produce it first:\n' +
    '  python3 scoring/olx_prompts.py --assembler-inputs <path>\n' +
    'then run this script with ASSEMBLER_INPUTS=<path>.')
  process.exit(2)
}
const inputs = JSON.parse(readFileSync(inputsPath, 'utf8'))
// FRAGMENTS COME FROM THE RUBRIC, via the dump -- `<Frame name="fragment:KEY">`.
// They were literals in olx_prompts.py until the assembler's refusal to default
// them made the case that they are the course's wording, not the engine's.
const fragments = inputs._fragments
delete inputs._fragments
// THE FRAME COMES FROM THE RUBRIC, via the dump. The migration's frozen copy has
// five segments; this rubric's `oc_criteria` has nine, and driving the assembler
// from the stale one truncated the criteria list on every cadence item.
const frame = inputs._frame
delete inputs._frame
delete inputs._handAuthoredAttrs

let ok = 0
const bad: string[] = []
for (const [id, d] of Object.entries<any>(inputs)) {
  let got: string
  try {
    const parts: string[] = [assembleBodyPrefix({
      item: d.item, blurb: d.blurb, webSystem: d.webSystem, fragments, frame })]
    if (d.item.itemNotes) parts.push(d.item.itemNotes)
    parts.push(assembleChecklist({
      slots: d.slots, credit: d.item.credit, notes: d.notes,
      fragments, rules: d.rules }))
    parts.push(assembleContextAndResponse({
      itemId: id, context: d.context, evidence: d.evidence ?? undefined,
      response: d.response, fragments, sections: d.sections }))
    got = parts.join('\n').replace(/\s+$/, '') + '\n'
  } catch (e: any) {
    bad.push(id + ' THREW ' + (e?.message ?? String(e)).slice(0, 90))
    continue
  }
  if (got === d.expected) { ok++; continue }
  let at = 0
  while (at < got.length && got[at] === d.expected[at]) at++
  bad.push(id + ' @' + at + '/' + d.expected.length +
           '\n      got  ' + JSON.stringify(got.slice(at, at + 64)) +
           '\n      want ' + JSON.stringify(d.expected.slice(at, at + 64)))
}
console.log('BYTE_EQUAL=' + ok + '/' + Object.keys(inputs).length)
if (bad.length) {
  console.log('differing (' + bad.length + '):')
  for (const b of bad.slice(0, 8)) console.log('  ' + b)
}
console.log('FROM_OLD_SOURCE=(nothing: frame and fragments both come from the rubric)')
