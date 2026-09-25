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
// BODIES AND ATTRIBUTES. The fourteen generated attributes on the open tag are
// assembled here too, now that `verify:assembled-attrs` reports 322 of 322
// matching. Only the attribute's VALUE is swapped, in place, so the tag's own
// line breaks and indentation are untouched -- the same rule the python writer
// states, and the reason a no-op write really is a no-op.
import { readFileSync, writeFileSync } from 'node:fs'
import { assembleBodyPrefix, assembleChecklist, assembleContextAndResponse }
  from '../lib/llm/promptAssembler'
import {
  countsAttr, onlyifAttr, requiresAttr, equalsAttr, coverAttr, forbidAttr,
  mapsAttr, freeAttr, slotsAttr, derivedAttr, maxAttr, expectAttr, rubricDefAttr,
  choicesAttr, slotPairsAttr } from '../lib/llm/attributeAssembler'

const inputs = JSON.parse(readFileSync(
  process.env.ASSEMBLER_INPUTS ?? '.stage/assembler-inputs.json', 'utf8'))
const fragments = inputs._fragments
const frame = inputs._frame
delete inputs._fragments
delete inputs._frame
// (item, attribute) pairs the generator names but does not OWN. Empty today, and
// passed rather than assumed for that reason: clearing every unsourced attribute
// works until the first entry exists, and then drops a rule from the web in
// silence.
const handAuthored = new Set<string>(
  (inputs._handAuthoredAttrs ?? []).map((p: string[]) => p.join('.')))
delete inputs._handAuthoredAttrs
const HANDOUTS = process.env.HANDOUT_DIR
  ?? (process.env.CONTENT_ROOT ?? '../edu.memphis.psych') + '/psychology'
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

/** Every generated attribute for one item, by name. */
function attrsFor(id: string, d: any): Record<string, string | null> {
  const i = d.attrInputs
  // BODIES ONLY when the inputs carry no attribute declarations. The TS-side
  // producer builds bodies first; reporting every attribute as differing because
  // it was not supplied would read as a regression in the assembler.
  if (!i) return {}
  return {
    rubricDef: rubricDefAttr(id), free: freeAttr(i.credit),
    forbid: forbidAttr(i.forbid), expect: expectAttr(i.expect),
    maps: mapsAttr(i.maps),
    choices: choicesAttr({ declared: i.choicesDeclared, users: i.choicesUsers,
                           sourced: i.choicesSourced, itemId: id }),
    counts: countsAttr(i.counts), requires: requiresAttr(i.requires),
    cover: coverAttr(i.cover), equals: equalsAttr(i.equals),
    onlyif: onlyifAttr(i.onlyif), max: maxAttr(i.max, i.maxPresent),
    slots: slotsAttr(i.slotSpec), derived: derivedAttr(i.derived),
    charge: slotPairsAttr(i.slotSpec, 'charge'),
    because: slotPairsAttr(i.slotSpec, 'because'),
  }
}

let same = 0, changed = 0, attrSame = 0, attrChanged = 0
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
    src = src.replace(re, (_m, head: string, old: string, close: string) => {
      const want = '\n' + body + '      '
      if (old === want) same++
      else { changed++; notes.push(id + ': body differs (' + old.length + ' on disk, ' + want.length + ' assembled)') }
      // THE VALUE ALONE IS SWAPPED, and an attribute the generator does not own
      // is left where it is: a tag with no `name=` to write into is python's hard
      // error, not something to invent here.
      let tag = head
      for (const [name, value] of Object.entries(attrsFor(id, d))) {
        const ar = new RegExp('(\\b' + name + '=")([^"]*)(")')
        const m2 = ar.exec(tag)
        if (!m2) { if (value !== null) notes.push(id + '.' + name + ': no attribute to write into'); continue }
        if (value === null && handAuthored.has(id + '.' + name)) continue
        // EMPTIED, NOT DELETED, matching the python writer: leaving `name=""`
        // keeps the slot for the next declaration instead of demanding it be
        // re-added by hand. A clear is REPORTED, because a silent one looks
        // exactly like a no-op.
        const next = value === null ? '' : value
        if (m2[2] === next) attrSame++
        else {
          attrChanged++
          notes.push(id + '.' + name + (next === '' ? ' would be CLEARED' : ' differs')
                     + ' (' + JSON.stringify(m2[2]) + ' -> ' + JSON.stringify(next) + ')')
        }
        tag = tag.replace(ar, (_a, a, _b, c) => a + next + c)
      }
      return tag + want + close
    })
  }
  if (write && src !== before) writeFileSync(path, src)
}
console.log('BODIES: ' + same + ' identical, ' + changed + ' differing'
            + '  ATTRS: ' + attrSame + ' identical, ' + attrChanged + ' differing'
            + (write ? ' (written)' : ' (dry run; pass --write)'))
for (const n of notes.slice(0, 6)) console.log('  ' + n)
process.exit(changed || attrChanged || notes.length ? 1 : 0)
