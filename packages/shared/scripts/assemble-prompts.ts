// Write the handouts' <LLMAction> bodies from the rubric.
//
// This is the PRODUCER item C exists to move. `olx_prompts.py` has written these
// bodies until now; `promptAssembler` is the designed producer and reproduces all
// 23 byte for byte (`verify:assembled-prompts`). What was missing was the step
// that puts the result on disk, which is this.
//
// DEFAULT IS A DRY RUN, and --write is opt-in, because the proof that the producer
// can be swapped is that writing changes NOTHING: the assembler's output spliced
// into the handouts must leave them byte-identical to what the python generator
// already put there. A writer that alters a single byte is a prompt change
// wearing a refactor's clothes, and `prompt_sha` would say so afterwards rather
// than before.
//
// BODIES ONLY. The generated ATTRIBUTES -- forbid=, expect= and the rest -- are
// still python's; they are a separate surface with their own verifiers, and doing
// both at once would make a failure ambiguous about which half caused it.
import { readFileSync, writeFileSync } from 'node:fs'
import { assembleBodyPrefix, assembleChecklist, assembleContextAndResponse }
  from '../lib/llm/promptAssembler'

const inputs = JSON.parse(readFileSync(process.env.ASSEMBLER_INPUTS!, 'utf8'))
const fragments = inputs._fragments
const frame = inputs._frame
delete inputs._fragments
delete inputs._frame
const HANDOUTS = process.env.HANDOUT_DIR!
const write = process.argv.includes('--write')

const NUL = String.fromCharCode(0)
const REF = new RegExp(NUL + 'REF:([^:]+):([^' + NUL + ']+)' + NUL, 'g')

/** The generator's own escaping, then its ref placeholders as <Ref> elements. */
function toXml(body: string): string {
  return body.replace(/&/g, '&amp;').replace(/</g, '&lt;')
             .replace(REF, (_m, id, target) => '<Ref id="' + id + '" target="' + target + '" />')
}

function assemble(id: string, d: any): string {
  const parts: string[] = [assembleBodyPrefix({
    item: d.item, blurb: d.blurb, webSystem: d.webSystem, fragments, frame })]
  if (d.item.itemNotes) parts.push(d.item.itemNotes)
  parts.push(assembleChecklist({
    slots: d.slots, credit: d.item.credit, notes: d.notes, fragments, rules: d.rules }))
  parts.push(assembleContextAndResponse({
    itemId: id, context: d.context, evidence: d.evidence ?? undefined,
    response: d.response, fragments, sections: d.sections }))
  return parts.join('\n').replace(/\s+$/, '') + '\n'
}

const byFile = new Map<string, Array<[string, any]>>()
for (const [id, d] of Object.entries<any>(inputs)) {
  if (!byFile.has(d.handoutFile)) byFile.set(d.handoutFile, [])
  byFile.get(d.handoutFile)!.push([id, d])
}

let same = 0, changed = 0
const notes: string[] = []
for (const [file, items] of byFile) {
  const path = HANDOUTS + '/' + file
  const before = readFileSync(path, 'utf8')
  let src = before
  for (const [id, d] of items) {
    const body = toXml(assemble(id, d))
    // The open tag carries the sheet's attributes and is left exactly as it is;
    // only the element's VALUE is swapped, with the generator's own framing -- a
    // newline after the tag and six spaces before the close.
    const esc = d.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp('(<LLMAction\\b[^>]*?\\bid="' + esc + '"[^>]*>)([\\s\\S]*?)(</LLMAction>)')
    if (!re.test(src)) { notes.push(id + ': no <LLMAction id=' + d.action + '>'); continue }
    src = src.replace(re, (_m, head, old, close) => {
      const want = '\n' + body + '      '
      if (old === want) same++
      else { changed++; notes.push(id + ': body differs (' + old.length + ' on disk, ' + want.length + ' assembled)') }
      return head + want + close
    })
  }
  if (write && src !== before) writeFileSync(path, src)
}
console.log('BODIES: ' + same + ' identical, ' + changed + ' differing'
            + (write ? ' (written)' : ' (dry run; pass --write)'))
for (const n of notes.slice(0, 6)) console.log('  ' + n)
process.exit(changed || notes.length ? 1 : 0)
