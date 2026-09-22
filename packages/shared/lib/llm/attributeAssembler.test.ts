// The sheet attributes generated from a rubric.
//
// These decide SCORING, not prose: a wrong `maps=` changes a score silently,
// where a wrong word only changes a prompt. Every generator is tested for the
// absent-versus-empty distinction as well as its grammar, because an ABSENT
// attribute and an EMPTY one are different bytes in the .olx and the parser
// treats them differently.
//
// Fixtures are synthetic and name no subject: the grammars are engine concepts
// and the slot names threaded through them are data.

import { describe, it, expect } from 'vitest'
import {
  countsAttr, onlyifAttr, requiresAttr, equalsAttr, coverAttr, forbidAttr,
  mapsAttr, freeAttr, slotsAttr, derivedAttr, maxAttr, choicesAttr,
} from './attributeAssembler'

describe('attribute generators: nothing declared means nothing emitted', () => {
  it('returns null rather than an empty string', () => {
    expect(countsAttr([])).toBeNull()
    expect(onlyifAttr([])).toBeNull()
    expect(requiresAttr([])).toBeNull()
    expect(equalsAttr([])).toBeNull()
    expect(coverAttr([])).toBeNull()
    expect(forbidAttr([])).toBeNull()
    expect(mapsAttr([])).toBeNull()
    expect(freeAttr([])).toBeNull()
    expect(slotsAttr([])).toBeNull()
    expect(derivedAttr([])).toBeNull()
  })
})

describe('the simple joins', () => {
  it('counts: one number, its members derived from it', () => {
    expect(countsAttr([{ key: 'total', slots: ['a', 'b', 'c'] }]))
      .toBe('total:a,b,c')
  })
  it('joins several rules with a pipe', () => {
    expect(onlyifAttr([{ key: 'x', cond: 'y' }, { key: 'p', cond: 'q' }]))
      .toBe('x:y|p:q')
  })
  it('requires: lenient verdicts are appended only when present', () => {
    expect(requiresAttr([{ key: 'x', cond: 'y' }])).toBe('x:y')
    expect(requiresAttr([{ key: 'x', cond: 'y', lenient: ['m', 'n'] }]))
      .toBe('x:y:m,n')
    expect(requiresAttr([{ key: 'x', cond: 'y', lenient: [] }])).toBe('x:y')
  })
  it('equals: left and right are comma-joined, lenient colon-appended', () => {
    expect(equalsAttr([{ key: 'k', left: 'l', right: 'r', lenient: ['u'] }]))
      .toBe('k:l,r:u')
  })
  it('cover: keys then labels', () => {
    expect(coverAttr([{ keys: ['a', 'b'], labels: ['first', 'second'] }]))
      .toBe('a,b:first,second')
  })
  it('forbid: a conjunction of slot=value operands', () => {
    expect(forbidAttr([{ key: 'none', conds: [
      { slot: 'a', value: 'absent' }, { slot: 'b', value: 'absent' }] }]))
      .toBe('none:a=absent,b=absent')
  })
})

describe('maps', () => {
  it('emits pairs and appends the fallback as a wildcard', () => {
    expect(mapsAttr([{ key: 'k', pick: 'p',
      pairs: [{ value: 'x', verdict: 'met' }], fallback: 'other' }]))
      .toBe('k:p:x~met,*~other')
  })
  it('omits the wildcard when no fallback is declared', () => {
    expect(mapsAttr([{ key: 'k', pick: 'p', pairs: [{ value: 'x', verdict: 'met' }] }]))
      .toBe('k:p:x~met')
  })
})

describe('free: read off credit, and declared rather than inferred', () => {
  it('collects only entries that name free verdicts', () => {
    expect(freeAttr([
      { what: 'a', free: ['unclear'] },
      { what: 'b' },
      { what: 'c', free: ['maybe', 'partial'] },
    ])).toBe('a:unclear|c:maybe,partial')
  })
  it('ignores empty strings inside the list', () => {
    expect(freeAttr([{ what: 'a', free: ['', 'unclear'] }])).toBe('a:unclear')
  })
})

describe('slots', () => {
  it('marks a gate with a leading bang', () => {
    expect(slotsAttr([{ key: 'k', gate: true, options: [] as never } as never]))
      .toBe('!k')
  })
  it('keeps an EMPTY label segment when a seg follows', () => {
    // Dropping it would shift `seg` into the label position and change every
    // sheet that uses one.
    expect(slotsAttr([{ key: 'k', seg: 'pick(set)' }])).toBe('k::pick(set)')
  })
  it('renders label, seg and points together', () => {
    expect(slotsAttr([{ key: 'k', label: 'Label', seg: 'pick(s)', pts: 2 }]))
      .toBe('k:Label:pick(s)@2')
  })
})

describe('derived', () => {
  it('skips a rule with no fields rather than emitting a malformed clause', () => {
    expect(derivedAttr([{ key: 'k', kind: 'contains', words: ['w'] }])).toBeNull()
  })
  it('skips an unknown kind', () => {
    expect(derivedAttr([{ key: 'k', kind: 'unheard-of', fields: ['f'] }])).toBeNull()
  })
  it('contains: the word list is the payload', () => {
    expect(derivedAttr([{ key: 'k', kind: 'contains', fields: ['f1', 'f2'],
                          words: ['one', 'two'] }]))
      .toBe('k:contains:f1,f2:one,two')
  })
  it('plots: rows joined by semicolons, values by commas, integers unadorned', () => {
    expect(derivedAttr([{ key: 'k', kind: 'plots', fields: ['f'],
                          template: [[1, 2.5], [3, 4]] }]))
      .toBe('k:plots:f:1,2.5;3,4')
  })
})

describe('max: the VALUE is generated, the PRESENCE is preserved', () => {
  it('emits nothing where the tag does not already carry the attribute', () => {
    expect(maxAttr(5, false)).toBeNull()
  })
  it('emits the rubric value where it does', () => {
    expect(maxAttr(5, true)).toBe('5')
    expect(maxAttr(2.5, true)).toBe('2.5')
  })
  it('emits nothing when the rubric declares no maximum', () => {
    expect(maxAttr(null, true)).toBeNull()
  })
})

describe('choices: generate what can be sourced, preserve what cannot', () => {
  it('keeps shipped membership verbatim when the rubric sources nothing', () => {
    expect(choicesAttr({ declared: { s: ['a', 'b'] }, users: { s: ['k'] },
                         sourced: {}, itemId: 'I' })).toBe('s:a,b')
  })
  it('reorders to the rubric and appends what the tag lacks', () => {
    expect(choicesAttr({ declared: { s: ['b', 'a'] }, users: { s: ['k'] },
                         sourced: { k: ['a', 'b', 'c'] }, itemId: 'I' }))
      .toBe('s:b,a,c')
  })
  it('refuses to invent a menu it cannot source', () => {
    expect(() => choicesAttr({ declared: { s: [] }, users: { s: ['k'] },
                               sourced: {}, itemId: 'I' }))
      .toThrow(/will not invent a menu/)
  })
  it('refuses to choose between slots that disagree', () => {
    expect(() => choicesAttr({ declared: { s: ['a'] }, users: { s: ['j', 'k'] },
                               sourced: { j: ['a'], k: ['b'] }, itemId: 'I' }))
      .toThrow(/will not choose/)
  })
})
