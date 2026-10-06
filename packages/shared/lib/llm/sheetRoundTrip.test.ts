// packages/shared/lib/llm/sheetRoundTrip.test.ts
//
// A published sheet must reach the grader with every rule it was written with.
//
// The sheet is the contract between the block that fills it and the grader that
// scores it, and the two are joined by JSON in a state field. A rule that goes
// missing in that hop does not error: the grader scores a sheet whose rules it
// cannot see, so a check the rule would have satisfied comes out unsatisfied and
// the item loses exactly that check's points. It reads as the model getting
// something wrong.
//
// That is not hypothetical. `expect` was added to the Payload type and passed to
// scoreSlotSheet, but readChecks copied fields BY HAND and never copied it — so
// four items lost a uniform 2 points on every ungated cell, PR fell from 17/18
// to 4/18, and the type checker was satisfied throughout. The engine was correct
// in isolation the whole time.
//
// So this asserts the property directly: publish a sheet carrying EVERY rule,
// round-trip it as the grader does, and require that scoring the result matches
// scoring with the rules in hand.
import { describe, it, expect } from 'vitest';
import {
  publishedSheet, scoreSlotSheet, parseSlots, parseCover, parseEquals,
  parseOnlyIf, parseCounts, parseChoices, parseExpect, parseMaps, DEFAULT_VERDICTS,
} from './slotSheet';
import { sheetFromJson } from '@/components/blocks/grading/SlotSheetGrader';

// One sheet that exercises every primitive at once.
const SLOTS = parseSlots(
  'a:Box one@1|b:Box two@1'
  + '|t:Which type this shows:pick(operant_type)'
  + '|right_type:Shows the type asked for@2'
  + '|n:How many reasons:count(2)|r1:First@1|r2:Second@1'
  + '|other:Which type they named:pick(operant_type)'
  + '|agrees:Names what it shows@1'
  + '|extra:Something else@1'
  // A MAPPED pair. `maps` was in publishedSheet's argument type and missing from
  // its RETURN, so no stored sheet ever carried it and no grader could compute a
  // mapped check -- the same class of loss as `expect` above, undetected because
  // this sheet did not exercise it.
  + '|box:What the box holds:pick(box_kind)'
  + '|legend:Has a legend@2'
  // A FORGIVEN verdict. Unlike every other rule here, `free` rides ON the slot
  // rather than in its own list, so it survives only while `sheetFromJson` copies
  // `slots` wholesale. The moment anyone reconstructs slots field by field -- the
  // way `readChecks` once copied the payload, losing `expect` -- this is what
  // goes missing, and a forgiven verdict would start costing its slot's points.
  + '|maybe:Stated clearly?:met/absent/unclear@2',
  DEFAULT_VERDICTS, 'maybe:unclear');
const RULES = {
  cover: parseCover('a,b:first,second'),
  equals: parseEquals('agrees:t,other:unclear'),
  onlyif: parseOnlyIf('extra:right_type'),
  counts: parseCounts('n:r1,r2'),
  choices: parseChoices('operant_type:PR,NR,PP,NP,unclear|box_kind:real,none'),
  expect: parseExpect('right_type:t=PR'),
  maps: parseMaps('legend:box:real~met,none~absent,*~absent'),
};
const CHECKS: any = {
  a: { verdict: 'met', refers_to: 'first' },
  b: { verdict: 'met', refers_to: 'second' },
  t: { refers_to: 'PR' },
  other: { refers_to: 'PR' },
  n: { count: 2 },
  extra: { verdict: 'met' },
  box: { refers_to: 'real' },   // the mapped verdict is NOT answered: it is computed
  maybe: { verdict: 'unclear' }, // unsatisfied, and declared free: costs nothing
};

describe('a published sheet round-trips its rules to the grader', () => {
  const sheet = publishedSheet({ slots: SLOTS, verdicts: CHECKS, showChecks: true, ...RULES });
  const back = sheetFromJson(JSON.stringify(sheet));

  it('carries every rule it was published with', () => {
    for (const key of ['cover', 'equals', 'onlyif', 'counts', 'expect', 'maps'] as const) {
      expect((back as any)?.[key], `rule '${key}' lost in the round trip`)
        .toEqual((RULES as any)[key]);
    }
    expect((back as any)?.choices).toEqual(RULES.choices);
    // `free` is carried ON the slot, so it is checked there rather than in the
    // rule list -- the same property, a different hiding place.
    expect((back as any)?.slots?.find((x: any) => x.key === 'maybe')?.free,
           "`free` lost in the round trip").toEqual(['unclear']);
  });

  it('scores the same after the round trip as with the rules in hand', () => {
    // The property that actually matters. If a rule is dropped, the checks it
    // satisfies come out unsatisfied and this number falls.
    const direct = scoreSlotSheet(SLOTS, CHECKS, undefined, RULES.cover, RULES.equals,
                                  RULES.onlyif, RULES.counts, RULES.expect, [], [],
                                  RULES.maps);
    const viaSheet = scoreSlotSheet(back!.slots, back!.verdicts as any, back!.max,
                                    back!.cover, back!.equals, back!.onlyif,
                                    back!.counts, (back as any).expect, [], [],
                                    (back as any).maps);
    expect(viaSheet).toEqual(direct);
    expect(direct!.score).toBe(direct!.max);   // this fixture is a clean pass
  });

  it('keeps a rule the reader does not know by name', () => {
    // The structural guard: the next primitive added must survive this hop even
    // before anyone teaches the reader about it.
    const withNew = { ...sheet, someFutureRule: [{ key: 'x' }] };
    expect((sheetFromJson(JSON.stringify(withNew)) as any).someFutureRule)
      .toEqual([{ key: 'x' }]);
  });
});
