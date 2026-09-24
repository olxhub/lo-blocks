// Can `attributeAssembler` reproduce the sheet attributes that SHIP?
//
// The bodies' counterpart. `olx_prompts.py` generates fourteen attributes on the
// <LLMAction> open tag from rubric declarations. Thirteen are pure
// rubric-to-string functions, and this measures all thirteen against what the
// python generator writes today.
//
// THREE ARE NOT MEASURED HERE, and saying so is the point of the last line:
//   choices    reads the SHIPPED .olx and preserves sets the rubric cannot
//              source, so it is not a function of the rubric alone and does not
//              belong in a rubric-to-string assembler
// A count that quietly covered the rest and reported "attributes" would be
// claiming that one too.
import { readFileSync } from 'node:fs'
import {
  countsAttr, onlyifAttr, requiresAttr, equalsAttr, coverAttr, forbidAttr,
  mapsAttr, freeAttr, slotsAttr, derivedAttr, maxAttr, expectAttr, rubricDefAttr, choicesAttr,
} from '../lib/llm/attributeAssembler'

const inputs = JSON.parse(readFileSync(process.env.ASSEMBLER_INPUTS!, 'utf8'))
delete inputs._fragments
delete inputs._frame

const PORTED = ['counts', 'onlyif', 'requires', 'equals', 'cover', 'forbid',
                'maps', 'free', 'slots', 'derived', 'max', 'expect', 'rubricDef',
                'choices']
const NOT_PORTED: string[] = []

let same = 0, differ = 0, setCount = 0
const bad: string[] = []
for (const [id, d] of Object.entries<any>(inputs)) {
  const i = d.attrInputs
  const got: Record<string, string | null> = {
    counts: countsAttr(i.counts),
    onlyif: onlyifAttr(i.onlyif),
    requires: requiresAttr(i.requires),
    equals: equalsAttr(i.equals),
    cover: coverAttr(i.cover),
    forbid: forbidAttr(i.forbid),
    maps: mapsAttr(i.maps),
    free: freeAttr(i.credit),
    slots: slotsAttr(i.slotSpec),
    derived: derivedAttr(i.derived),
    max: maxAttr(i.max, i.maxPresent),
    expect: expectAttr(i.expect),
    rubricDef: rubricDefAttr(id),
    choices: choicesAttr({ declared: i.choicesDeclared, users: i.choicesUsers,
                           sourced: i.choicesSourced, itemId: id }),
  }
  for (const name of PORTED) {
    const want = d.attrs[name] ?? null
    const mine = got[name] ?? null
    if (want !== null) setCount++
    if (String(mine) === String(want)) same++
    else {
      differ++
      bad.push(id + '.' + name + '\n      got  ' + JSON.stringify(mine)
               + '\n      want ' + JSON.stringify(want))
    }
  }
}
console.log('ATTRS: ' + same + ' of ' + (same + differ)
            + ' match (' + setCount + ' of them actually set)')
if (bad.length) {
  console.log('differing (' + differ + '):')
  for (const b of bad.slice(0, 8)) console.log('  ' + b)
}
console.log(NOT_PORTED.length ? 'NOT MEASURED: ' + NOT_PORTED.join(', ')
                              : 'NOT MEASURED: (nothing -- all 14 are covered)')
process.exit(differ ? 1 : 0)
