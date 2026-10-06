// The `derived` grammar, and the silent failure it is prone to.
//
// A derived rule is `key:kind:refs[:template]`. An unknown kind is DROPPED by the
// parser -- no error, no warning -- so `w1:wk1` (the kind omitted) yields no rule,
// the check gets no verdict, and it scores unmet however the student answers. On
// 2026-09-13 every `derived=` in the grading documentation was written that way.
import { describe, it, expect } from 'vitest';
import { parseDerived, parseSlots, scoreSlotSheet, DERIVED_KINDS } from '@/lib/llm/slotSheet';
import { verdictFor } from '@/lib/llm/derivedVerdicts';

const checksFor = (spec: string, fields: Record<string, string>) => {
  const out: any = {};
  for (const rule of parseDerived(spec)) {
    out[rule.key] = verdictFor(rule, rule.targets.map(t => fields[t] ?? ''));
  }
  return out;
};

describe('parseDerived', () => {
  it('knows exactly four kinds', () => {
    expect([...DERIVED_KINDS].sort()).toEqual(['complete', 'contains', 'plots', 'present']);
  });

  it('DROPS a rule whose kind is missing or unknown — the silent failure', () => {
    expect(parseDerived('w1:wk1')).toEqual([]);            // kind omitted
    expect(parseDerived('w1:nosuchkind:wk1')).toEqual([]); // kind misspelled
    expect(parseDerived('present:wk1')).toEqual([]);       // kind in the key's place
    // and the consequence: no rule means no verdict means no credit
    const slots = parseSlots('w1:Week 1@1');
    const r = scoreSlotSheet(slots, checksFor('w1:wk1', { wk1: 'plenty of data' }), 1);
    expect(r!.score, 'a dropped rule silently costs the point').toBe(0);
  });

  it('parses the kind, its refs and its template', () => {
    expect(parseDerived('a:present:f1,f2')[0])
      .toMatchObject({ key: 'a', kind: 'present', targets: ['f1', 'f2'] });
    expect(parseDerived('b:contains:f1:fixed,ratio')[0])
      .toMatchObject({ key: 'b', kind: 'contains', words: ['fixed', 'ratio'] });
    expect(parseDerived('c:complete:f1,f2:8,10;3,4')[0].template).toEqual([[8, 10], [3, 4]]);
  });

  it('does not read an absent template as the number zero', () => {
    // Number('') is 0, so an absent template could otherwise parse as [[0]] and
    // match a student who typed a single zero.
    expect(parseDerived('a:plots:f1')[0].template).toEqual([]);
  });
});

describe('the derived kinds decide a verdict from the page', () => {
  it('present: anything at all in the fields', () => {
    const c = checksFor('w1:present:f1|w2:present:f2', { f1: '5, 6', f2: '' });
    expect(c.w1.verdict).toBe('met');
    expect(c.w2.verdict).toBe('absent');
  });

  it('contains: the whole answer is one haystack', () => {
    // A student who used the word in the first box only has still used it.
    const c = checksFor('k:contains:a,b:ratio,interval', { a: 'a fixed ratio', b: '' });
    expect(c.k.verdict).toBe('met');
    expect(checksFor('k:contains:a,b:ratio', { a: 'nothing', b: 'here' }).k.verdict)
      .toBe('absent');
  });

  it('complete: SOME data is not all of it', () => {
    expect(checksFor('k:complete:a,b,c', { a: '1', b: '', c: '3' }).k.verdict).toBe('absent');
    expect(checksFor('k:complete:a,b,c', { a: '1', b: '2', c: '3' }).k.verdict).toBe('met');
  });

  it('plots: the worked example\'s own data is not the student\'s work', () => {
    const spec = 'k:plots:a:1,2,3';
    expect(checksFor(spec, { a: '1, 2, 3' }).k.verdict).toBe('mismatch');
    expect(checksFor(spec, { a: '4, 5, 6' }).k.verdict).toBe('met');
    expect(checksFor(spec, { a: 'no numbers' }).k.verdict).toBe('absent');
  });
});

describe('a derived sheet scores like any other', () => {
  it('credits exactly the checks the page satisfies', () => {
    const slots = parseSlots('w1:Week 1@1|w2:Week 2@1|w3:Week 3@1');
    const spec = 'w1:present:f1|w2:present:f2|w3:present:f3';
    const r = scoreSlotSheet(slots, checksFor(spec, { f1: '5', f2: '', f3: '7' }), 3);
    expect(r!.score).toBe(2);
    expect(r!.failed).toEqual(['w2']);
  });
});
