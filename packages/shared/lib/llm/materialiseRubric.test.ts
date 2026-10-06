// Build-time materialisation: a rubric containing templates becomes one made
// only of literal items.
//
// What these defend is the boundary. Expansion happens ONCE, here, so every
// later reader sees ordinary items; a test that let a template survive into the
// output would be permitting a second implementation somewhere downstream.

import { describe, it, expect, beforeEach } from 'vitest'
import { materialiseRubric, parseParams, parseConditions, warnings, resetWarnings }
  from './materialiseRubric'
import { TemplateError } from './itemTemplate'
import type { RubricNode } from './materialiseRubric'

const TPL: RubricNode = {
  kind: 'ItemTemplate', attrs: { name: 'pair' },
  children: [
    { kind: 'Slot', attrs: { key: 'is_generic', pts: '2' }, text: 'Shared.' },
    { kind: 'Slot', attrs: { key: 'is_{abbrev}', pts: '2' }, text: 'Specifically {longName}' },
    { kind: 'Forbid', attrs: { key: 'excluded', ifDeclared: 'hasExtra' } },
  ],
}
const item = (over: Record<string, string> = {}): RubricNode => ({
  kind: 'Item',
  attrs: { scores: 'thing_a', use: '@pair', max: '4',
           params: 'longName=Alpha Kind|abbrev=a', ...over },
})

beforeEach(resetWarnings)

describe('parseParams', () => {
  it('reads name=value pairs', () => {
    expect(parseParams('a=1|b=2')).toEqual({ a: '1', b: '2' })
  })
  it('splits on the FIRST = only, so a value may contain one', () => {
    // A definition or a rule can contain "=", and splitting on every one would
    // truncate it silently at the first.
    expect(parseParams('rule=x = y')).toEqual({ rule: 'x = y' })
  })
  it('ignores empty segments', () => {
    expect(parseParams('a=1||')).toEqual({ a: '1' })
  })
  it('refuses an entry with no =', () => {
    expect(() => parseParams('oops')).toThrow(/has no "="/)
  })
})

describe('parseConditions', () => {
  it('splits and trims', () => {
    expect(parseConditions(' a | b ')).toEqual(['a', 'b'])
  })
  it('is empty for an absent attribute', () => {
    expect(parseConditions(undefined)).toEqual([])
  })
})

describe('materialiseRubric', () => {
  it('replaces a templated item with a LITERAL one', () => {
    const out = materialiseRubric([TPL, item()])
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('Item')
    expect(out[0].attrs).toEqual({ scores: 'thing_a', max: '4' })
    expect(out[0].children!.map(c => c.attrs!.key)).toEqual(['is_generic', 'is_a'])
    expect(out[0].children![1].text).toBe('Specifically Alpha Kind')
  })

  it('DROPS the template: it was the source, not the output', () => {
    expect(materialiseRubric([TPL, item()]).some(n => n.kind === 'ItemTemplate')).toBe(false)
  })

  it('leaves NO placeholder behind', () => {
    const json = JSON.stringify(materialiseRubric([TPL, item()]))
    expect(json).not.toMatch(/\{[a-z]+\}/i)
  })

  it('strips `ifDeclared` once acted on, and KEEPS a child\'s own `cond`', () => {
    // Leaving it would invite a later pass to re-evaluate a decision already
    // made, against conditions it no longer has.
    const out = materialiseRubric([TPL, item({ conditions: 'hasExtra' })])
    const forbid = out[0].children!.find(c => c.kind === 'Forbid')!
    expect(forbid.attrs).not.toHaveProperty('ifDeclared')
  })

  it('includes a conditional child only for the item that declares it', () => {
    const plain = materialiseRubric([TPL, item()])
    const extra = materialiseRubric([TPL, item({ conditions: 'hasExtra' })])
    expect(plain[0].children!.some(c => c.kind === 'Forbid')).toBe(false)
    expect(extra[0].children!.some(c => c.kind === 'Forbid')).toBe(true)
  })

  it('passes an untemplated item through untouched', () => {
    const plain: RubricNode = { kind: 'Item', attrs: { scores: 'q', max: '2' } }
    expect(materialiseRubric([plain])).toEqual([plain])
  })

  it('refuses an item naming a template the rubric does not declare', () => {
    expect(() => materialiseRubric([item({ use: '@missing' })]))
      .toThrow(/which this rubric does not declare/)
  })

  it('refuses two templates with one name', () => {
    // Keeping the last silently would make an edit to the first do nothing.
    expect(() => materialiseRubric([TPL, TPL])).toThrow(/both named/)
  })

  it('propagates a missing parameter rather than shipping a hole', () => {
    expect(() => materialiseRubric([TPL, item({ params: 'abbrev=a' })]))
      .toThrow(TemplateError)
  })

  it('warns about a param nothing asks for, without failing', () => {
    const out = materialiseRubric([TPL, item({ params: 'longName=A|abbrev=a|stale=x' })])
    expect(out).toHaveLength(1)
    expect(warnings.join(' ')).toMatch(/params nothing asks for: stale/)
  })

  it('warns about a template no item uses', () => {
    materialiseRubric([TPL])
    expect(warnings.join(' ')).toMatch(/used by no item/)
  })
})
