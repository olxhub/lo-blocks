// A DECLARED-FREE verdict is unsatisfied and costs nothing.
//
// The two engines encode failure with opposite defaults: this runtime fails
// anything that is not the satisfying verdict, the paper ledger charges only
// what a deduction CODE names. `free=` is what removes the default, so these
// tests pin BOTH directions -- forgiven where declared, charged where not.
import { describe, it, expect } from 'vitest';
import { parseSlots, parseFree, parseOnlyIf, scoreSlotSheet, publishedSheet,
         buildSlotSchema, composeSlotFeedback } from '@/lib/llm/slotSheet';

const SLOTS = 'utb_stated:Stated?:met/absent/unclear@2|other:Other:met/absent@1';

describe('free verdicts', () => {
  it('parses the attribute', () => {
    expect(parseFree('utb_stated:unclear')).toEqual({ utb_stated: ['unclear'] });
    expect(parseFree('a:x,y|b:z')).toEqual({ a: ['x', 'y'], b: ['z'] });
    expect(parseFree('')).toEqual({});
  });

  it('does not charge a declared-free verdict', () => {
    const slots = parseSlots(SLOTS, ['met', 'absent'], 'utb_stated:unclear');
    const r = scoreSlotSheet(slots, {
      utb_stated: { verdict: 'unclear' }, other: { verdict: 'met' },
    }, 3);
    expect(r!.score).toBe(3);           // the 2 points are KEPT
    expect(r!.failed).toEqual([]);
  });

  it('still charges a failing verdict that is NOT declared free', () => {
    const slots = parseSlots(SLOTS, ['met', 'absent'], 'utb_stated:unclear');
    const r = scoreSlotSheet(slots, {
      utb_stated: { verdict: 'absent' }, other: { verdict: 'met' },
    }, 3);
    expect(r!.score).toBe(1);
    expect(r!.failed).toEqual(['utb_stated']);
  });

  it('scores exactly as before when no free list is declared', () => {
    const slots = parseSlots(SLOTS, ['met', 'absent']);
    const r = scoreSlotSheet(slots, {
      utb_stated: { verdict: 'unclear' }, other: { verdict: 'met' },
    }, 3);
    expect(r!.score).toBe(1);           // the old default: anything not met fails
  });

  it('rides through publishedSheet, so a stored sheet keeps its own rules', () => {
    const slots = parseSlots(SLOTS, ['met', 'absent'], 'utb_stated:unclear');
    const sheet: any = publishedSheet({ slots, verdicts: {}, showChecks: false });
    expect(sheet.slots.find((s: any) => s.key === 'utb_stated').free).toEqual(['unclear']);
    const back = scoreSlotSheet(sheet.slots, {
      utb_stated: { verdict: 'unclear' }, other: { verdict: 'met' },
    }, 3);
    expect(back!.failed).toEqual([]);
    expect(back!.score).toBe(3);
  });
});

describe('free — the interactions, which isolation does not cover', () => {
  it('parses robustly: whitespace, several slots, empty and malformed input', () => {
    expect(parseFree('  a : x , y | b : z ')).toEqual({ a: ['x', 'y'], b: ['z'] });
    expect(parseFree('novalues:')).toEqual({});
    expect(parseFree('nocolon')).toEqual({});
    expect(parseFree(undefined)).toEqual({});
  });

  it('does NOT change the response schema — a free verdict is still asked for', () => {
    // `free` decides what a verdict COSTS, never what the model is asked. If it
    // reached the schema it would move `prompt_sha` and buy a re-sweep for a
    // scoring-only change.
    const plain = parseSlots('u:Stated?:met/absent/unclear@2');
    const freed = parseSlots('u:Stated?:met/absent/unclear@2', ['met', 'absent'], 'u:unclear');
    expect(JSON.stringify(buildSlotSchema(freed)))
      .toBe(JSON.stringify(buildSlotSchema(plain)));
  });

  it('shows the student the verdict, not a tick and not "not reported"', () => {
    const slots = parseSlots('u:Stated?:met/absent/unclear@2', ['met', 'absent'], 'u:unclear');
    const out = composeSlotFeedback(
      slots, { checks: { u: { verdict: 'unclear', evidence: 'x' } } }, { showChecks: true });
    expect(out).toMatch(/Stated\?\*\* — unclear/);   // the decision is stated
    expect(out).not.toMatch(/✓/);                     // but not credited
    expect(out).not.toMatch(/not reported/);          // and not silent
  });

  it('suppresses the charge independently of `onlyif`', () => {
    const slots = parseSlots('c:Cond:met/absent@1|d:Dep:met/absent/unclear@2',
                             ['met', 'absent'], 'd:unclear');
    const r = scoreSlotSheet(slots, { c: { verdict: 'absent' }, d: { verdict: 'unclear' } },
                             3, [], [], parseOnlyIf('d:c'));
    // `c` fails and is charged; `d` is both uncharged (its condition failed) and
    // free. Two suppressions on one slot must not double-count or resurrect it.
    expect(r!.score).toBe(2);
    expect(r!.failed).toEqual(['c']);
  });

  it('DOES NOT rescue a GATE — a free verdict still voids the item', () => {
    // PINNED, NOT ENDORSED. `failedGate` asks satisfiedMap, which knows nothing
    // about `free`, so a gating slot answered with a forgiven verdict still zeroes
    // the whole item while costing no points of its own. Those two readings
    // contradict each other, and which is right is a rubric question rather than
    // an obvious bug: a gate means "the rest is moot", and `free` means "this
    // costs nothing".
    //
    // No shipped content puts a free verdict on a gate, so this is latent. The
    // test exists so that changing it is a DECISION with a failing test attached,
    // rather than something discovered from a student's score.
    const slots = parseSlots('!g:Gate:met/absent/unclear@2|o:Other:met/absent@1',
                             ['met', 'absent'], 'g:unclear');
    const r = scoreSlotSheet(slots, { g: { verdict: 'unclear' }, o: { verdict: 'met' } }, 3);
    expect(r!.score).toBe(0);
    expect(r!.failed).toEqual(['g']);
  });
});
