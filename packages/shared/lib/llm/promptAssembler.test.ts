// The prompt assembler: layout only, with every word supplied by the caller.
//
// The contract these tests defend is that the engine ORDERS, NUMBERS and LAYS
// OUT while the rubric supplies the prose. So the fixtures below carry nonsense
// headings on purpose -- if a test passed with a real heading baked into the
// module, the module would be holding content it must not hold (C2).

import { describe, it, expect } from 'vitest'
import {
  frag, renderFrame, assembleBodyPrefix, assembleChecklist,
  assembleContextAndResponse,
} from './promptAssembler'

const F = {
  itemHeading: 'H {id} {max}',
  questionHeading: 'Q-HEAD',
  creditHeading: 'C-HEAD',
  deductionHeading: 'D-HEAD',
  guidanceHeading: 'G-HEAD',
  checklistPreamble: 'CL-ONE\nCL-TWO',
  countsNote: 'COUNTS {members} -> {key}',
  gateNote: 'GATE-NOTE',
  mapsNote: 'MAPS {key} {pick} {pairs}{tail}',
  forbidNote: 'FORBID {key} {pairs}',
  equalsNote: 'EQ {key} {left} {right}{lenient}',
  equalsLenient: ' EQ-LENIENT {options}',
  expectNote: 'EX {key} {left} {value}{lenient}',
  expectLenient: ' EX-LENIENT {options}',
  derivedNote: 'DER {key} {body}',
  derivedPresent: 'D-PRESENT',
  derivedContains: 'D-CONTAINS {words}',
  derivedPlots: 'D-PLOTS',
  sectionHeading: 'S {heading}',
  contextHeading: 'CTX-HEAD',
  contextPreamble: 'CTX-PRE',
  responseHeading: 'R-HEAD {itemId}',
  responsePreamble: 'R-PRE',
  askedFor: '\nASKED {label}',
  boxOpen: '[open] ',
  boxClose: ' [close]',
  endOfResponse: 'END',
}

const emptyRules = { counts: [], equals: [], derived: [], choices: {},
                     expect: [], forbid: [], maps: [] }

describe('frag', () => {
  it('fills named placeholders', () => {
    expect(frag({ a: 'x {y} z' }, 'a', { y: 'Y' })).toBe('x Y z')
  })
  it('leaves an unsupplied placeholder alone rather than blanking it', () => {
    expect(frag({ a: '{missing}' }, 'a')).toBe('{missing}')
  })
  it('THROWS on a missing fragment instead of rendering a gap', () => {
    // A silently truncated prompt is far worse than a loud failure: the model
    // answers a question with a section missing and nothing downstream knows.
    expect(() => frag({}, 'nope')).toThrow(/was not supplied/)
  })
})

describe('renderFrame', () => {
  const segs = [
    { text: 'A' },
    { text: 'B', when: 'flag' },
    { text: 'C', when: '!flag' },
    { text: 'D {p}' },
  ]
  it('includes a conditional segment when the condition holds', () => {
    expect(renderFrame(segs, new Set(['flag']), { p: 'P' })).toBe('ABD P')
  })
  it('includes the negated segment when it does not', () => {
    expect(renderFrame(segs, new Set(), { p: 'P' })).toBe('ACD P')
  })
  it('substitutes parameters by name', () => {
    expect(renderFrame([{ text: '{a}-{b}' }], new Set(), { a: '1', b: '2' }))
      .toBe('1-2')
  })
})

describe('assembleBodyPrefix', () => {
  const base = {
    blurb: 'BLURB', webSystem: 'SYS {blurb}', fragments: F,
    item: {
      id: 'X', max: 6, question: 'QUESTION',
      credit: [{ what: 'a', desc: 'DA', pts: 2 },
               { what: 'b', desc: 'DB' },
               { what: 'c', desc: 'DC', gates: ['g'] }],
      deductions: [{ code: 'K', pts: 6, text: 'TK' },
                   { code: 'R', pts: 2, text: 'TR', repeatable: true }],
      guidance: ['G1', 'G2'],
    },
  }
  it('formats points without trailing zeros', () => {
    expect(assembleBodyPrefix(base)).toContain('H X 6')
    expect(assembleBodyPrefix({ ...base, item: { ...base.item, max: 2.5 } }))
      .toContain('H X 2.5')
  })
  it('labels credit three ways: gate, points, and neither', () => {
    const out = assembleBodyPrefix(base)
    expect(out).toContain('- `a` (2 pt): DA')
    expect(out).toContain('- `b`: DB')
    expect(out).toContain('- `c` **GATE**: DC')
  })
  it('marks a repeatable deduction', () => {
    expect(assembleBodyPrefix(base)).toContain('- `R` (-2) [repeatable]: TR')
  })
  it('omits named credit and deductions', () => {
    const out = assembleBodyPrefix({ ...base, item: {
      ...base.item, omitCredit: ['a'], omitDeduction: ['K'] } })
    expect(out).not.toContain('DA')
    expect(out).not.toContain('TK')
  })
  it('drops guidance lines by index, and the heading when none survive', () => {
    expect(assembleBodyPrefix({ ...base, item: {
      ...base.item, omitGuidance: [0] } })).not.toContain('- G1')
    expect(assembleBodyPrefix({ ...base, item: {
      ...base.item, omitGuidance: [0, 1] } })).not.toContain('G-HEAD')
  })
  it('places a term definition before the body that uses the word', () => {
    const out = assembleBodyPrefix({ ...base, item: {
      ...base.item, termDefinition: 'TERMDEF' } })
    expect(out.indexOf('TERMDEF')).toBeLessThan(out.indexOf('C-HEAD'))
  })
  it('renders a frame instead of credit when the item derives from clauses', () => {
    const out = assembleBodyPrefix({ ...base,
      item: { ...base.item, deriveFromClauses: true, conditions: ['k'] },
      frame: [{ text: 'FRAME-A' }, { text: 'FRAME-B', when: 'k' }] })
    expect(out).toContain('FRAME-AFRAME-B')
    expect(out).not.toContain('C-HEAD')
  })
})

describe('assembleChecklist', () => {
  const slots = [
    { key: 'plain', options: ['met', 'absent'], gates: false },
    { key: 'gated', options: ['met', 'absent'], gates: true },
    { key: 'num', options: [], gates: false, count_max: 3 },
    { key: 'picky', options: [], gates: false, picks: 'set' },
  ]
  const call = (over: Partial<Parameters<typeof assembleChecklist>[0]> = {}) =>
    assembleChecklist({ slots, credit: [{ what: 'plain', desc: 'PLAIN-DESC' }],
                        fragments: F, rules: emptyRules, ...over })
  it('renders each slot head by kind', () => {
    const out = call({ rules: { ...emptyRules, choices: { set: ['x', 'y'] } } })
    expect(out).toContain('- `plain` — `met`/`absent`: PLAIN-DESC')
    expect(out).toContain('- `gated` **GATE** — `met`/`absent`')
    expect(out).toContain('- `num` — a NUMBER from 0 to 3 (how many, not a judgement)')
    expect(out).toContain('- `picky` — one of `x`/`y` in `refers_to`')
  })
  it('prefers a supplied note over the credit description', () => {
    expect(call({ notes: { plain: 'NOTE' } })).toContain('- `plain` — `met`/`absent`: NOTE')
  })
  it('emits the gate warning only when a slot gates', () => {
    expect(call()).toContain('GATE-NOTE')
    expect(assembleChecklist({ slots: [slots[0]], credit: [], fragments: F,
                               rules: emptyRules })).not.toContain('GATE-NOTE')
  })
  it('writes a DO-NOT-ANSWER paragraph for every computed family', () => {
    const out = assembleChecklist({ slots, credit: [], fragments: F, rules: {
      counts: [{ key: 'num', slots: ['a', 'b'] }],
      equals: [{ key: 'e', left: 'l', right: 'r', lenient: ['u'] }],
      derived: [{ key: 'd', kind: 'contains', words: ['w'] }],
      choices: {},
      expect: [{ key: 'x', left: 'l', value: 'v' }],
      forbid: [{ key: 'f', conds: [{ slot: 's', value: 'absent' }] }],
      maps: [{ key: 'm', pick: 'p', pairs: [{ value: 'a', verdict: 'met' }],
               fallback: 'z' }],
    } })
    expect(out).toContain('COUNTS `a`, `b` -> `num`')
    expect(out).toContain('EQ `e` `l` `r` EQ-LENIENT `u`')
    expect(out).toContain('DER `d` D-CONTAINS "w"')
    expect(out).toContain('EX `x` `l` `v`')
    expect(out).toContain('FORBID `f` `s` is `absent`')
    expect(out).toContain('MAPS `m` `p` `a` makes it `met`, and anything else makes it `z`')
  })
  it('leaves a computed slot OUT of the answerable list', () => {
    const out = assembleChecklist({ slots, credit: [], fragments: F,
      rules: { ...emptyRules, maps: [{ key: 'plain', pick: 'p', pairs: [] }] } })
    expect(out).not.toContain('- `plain` —')
  })
})

describe('assembleContextAndResponse', () => {
  const ref = (label: string, id: string) => ({ label, refId: id, target: 't-' + id })
  it('renders declared sections BEFORE the cross-references', () => {
    const out = assembleContextAndResponse({
      itemId: 'X', fragments: F, response: [ref('', 'r')],
      sections: [{ heading: 'SEC', body: 'SECBODY' }],
      context: [{ heading: 'OTHER', lines: [ref('L', 'c')] }] })
    expect(out.indexOf('S SEC')).toBeLessThan(out.indexOf('CTX-HEAD'))
    expect(out).toContain('S SEC\nSECBODY')
  })
  it('omits the context block entirely when there is none', () => {
    expect(assembleContextAndResponse({ itemId: 'X', fragments: F, context: [],
      response: [ref('', 'r')] })).not.toContain('CTX-HEAD')
  })
  it('adds the label preamble only when some box is labelled', () => {
    expect(assembleContextAndResponse({ itemId: 'X', fragments: F, context: [],
      response: [ref('', 'r')] })).not.toContain('R-PRE')
    expect(assembleContextAndResponse({ itemId: 'X', fragments: F, context: [],
      response: [ref('L', 'r')] })).toContain('R-PRE')
  })
  it('wraps each box and ends with the closing marker', () => {
    const out = assembleContextAndResponse({ itemId: 'X', fragments: F,
      context: [], response: [ref('', 'r')] })
    expect(out).toContain('[open] ')
    expect(out).toContain(' [close]')
    expect(out.trimEnd().endsWith('END')).toBe(true)
  })
})
