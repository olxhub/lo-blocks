// Item templates: parallelism in the template, differences on the item.
//
// The fixtures below use neutral names on purpose. A test that passed with a
// subject's vocabulary in it would mean the module had learned something it
// must not know (C2) -- the engine substitutes names and tests membership, and
// nothing here should read as belonging to one course.

import { describe, it, expect } from 'vitest'
import { expandItem, unusedParams, fill, TemplateError } from './itemTemplate'
import type { ItemTemplate, ItemDecl } from './itemTemplate'

const TPL: ItemTemplate = {
  name: 'pair',
  nodes: [
    { kind: 'Question', text: 'Give an example of {longName}.' },
    { kind: 'Slot', attrs: { key: 'is_generic', pts: '2' }, text: 'Shared wording.' },
    { kind: 'Slot', attrs: { key: 'is_{abbrev}', pts: '2' },
      text: 'Specifically {longName}' },
    { kind: 'Expect', attrs: { key: 'shows_kind', left: '{left}', value: '{value}' } },
    { kind: 'Onlyif', attrs: { key: '{targetSlot}', cond: 'shows_kind' } },
    { kind: 'Forbid', attrs: { key: 'excluded' }, cond: 'hasExtra' },
    { kind: 'Note', text: 'only when NOT extra', cond: '!hasExtra' },
  ],
}

const base: ItemDecl = {
  scores: 'thing_a', use: 'pair', max: 4,
  params: { longName: 'Alpha Kind', abbrev: 'a', left: 'observed', value: 'A',
            targetSlot: 'targets_one' },
}

describe('substitution', () => {
  it('fills placeholders in TEXT', () => {
    const { nodes } = expandItem(TPL, base)
    expect(nodes.find(n => n.kind === 'Question')!.text)
      .toBe('Give an example of Alpha Kind.')
  })

  it('fills placeholders in ATTRIBUTE VALUES, which is what makes keys vary', () => {
    // `key="is_{abbrev}"` is the case a prose-only mechanism cannot express.
    const { nodes } = expandItem(TPL, base)
    const keys = nodes.filter(n => n.kind === 'Slot').map(n => n.attrs.key)
    expect(keys).toEqual(['is_generic', 'is_a'])
  })

  it('lets a RULE TARGET be a parameter, not only a name', () => {
    const { nodes } = expandItem(TPL, base)
    expect(nodes.find(n => n.kind === 'Onlyif')!.attrs.key).toBe('targets_one')
    const other = expandItem(TPL, { ...base, scores: 'thing_b',
      params: { ...base.params, targetSlot: 'targets_two' } })
    expect(other.nodes.find(n => n.kind === 'Onlyif')!.attrs.key).toBe('targets_two')
  })

  it('THROWS on a placeholder the item does not supply', () => {
    // Leaving it literal ships prose reading "specifically {longName}", or a
    // slot key of `is_` that scores nothing and matches nothing.
    const { longName, ...rest } = base.params!
    expect(() => expandItem(TPL, { ...base, params: rest }))
      .toThrow(TemplateError)
    expect(() => expandItem(TPL, { ...base, params: rest }))
      .toThrow(/asks for \{longName\}/)
  })

  it('names the item and the node in the error, not just the placeholder', () => {
    const { abbrev, ...rest } = base.params!
    expect(() => expandItem(TPL, { ...base, params: rest })).toThrow(/thing_a\/Slot/)
  })
})

describe('conditional children: differences live on the item', () => {
  it('omits a conditional child when the item does not declare it', () => {
    const { nodes } = expandItem(TPL, base)
    expect(nodes.some(n => n.kind === 'Forbid')).toBe(false)
  })

  it('includes it when the item does', () => {
    const { nodes } = expandItem(TPL, { ...base, conditions: ['hasExtra'] })
    expect(nodes.some(n => n.kind === 'Forbid')).toBe(true)
  })

  it('supports a negated condition', () => {
    expect(expandItem(TPL, base).nodes.some(n => n.kind === 'Note')).toBe(true)
    expect(expandItem(TPL, { ...base, conditions: ['hasExtra'] })
      .nodes.some(n => n.kind === 'Note')).toBe(false)
  })

  it('two items differing ONLY by a condition produce different structures', () => {
    // The whole point: no list of ids anywhere says which item is special.
    const plain = expandItem(TPL, base)
    const extra = expandItem(TPL, { ...base, conditions: ['hasExtra'] })
    expect(extra.nodes.length).toBe(plain.nodes.length)      // one in, one out
    expect(plain.nodes.map(n => n.kind)).not.toEqual(extra.nodes.map(n => n.kind))
  })
})

describe('the item keeps what is its own', () => {
  it('carries `scores` and `max` through untouched', () => {
    const out = expandItem(TPL, base)
    expect(out.scores).toBe('thing_a')
    expect(out.max).toBe(4)
  })

  it('refuses to expand against the wrong template', () => {
    expect(() => expandItem(TPL, { ...base, use: 'other' }))
      .toThrow(/uses template "other"/)
  })
})

describe('unusedParams', () => {
  it('reports a param no node asks for', () => {
    // Usually a half-landed rename, and invisible otherwise: filling never
    // touches it, so nothing else would ever mention it.
    expect(unusedParams(TPL, { ...base, params: { ...base.params, stale: 'x' } }))
      .toEqual(['stale'])
  })

  it('is quiet when every param is used', () => {
    expect(unusedParams(TPL, base)).toEqual([])
  })
})

describe('fill', () => {
  it('leaves text with no placeholders alone', () => {
    expect(fill('plain', {}, 'where')).toBe('plain')
  })
  it('fills repeated placeholders', () => {
    expect(fill('{a} and {a}', { a: 'x' }, 'where')).toBe('x and x')
  })
})
