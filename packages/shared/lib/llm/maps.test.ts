import { describe, expect, it } from 'vitest';
import {
  buildSlotSchema,
  composeSlotFeedback,
  parseMaps,
  mappedVerdict,
  satisfiedMap,
  parseSlots,
  parseForbid,
  scoreSlotSheet,
} from './slotSheet';

// `maps` exists because the other computed primitives each produce a check with
// ONE failing verdict: they answer a yes/no question about other answers. Q4b's
// `behavior_*` has TWO kinds of failure with different deduction codes -- `absent`
// for an empty box ("you only gave one example") and `not_active` for something
// present that is not an activity done instead of the goal behaviour, which is
// repeatable. Deriving that needs a value-to-verdict map.
// The sheet's own vocabulary: `wrong_kind` is a REGISTERED extra verdict, so it is
// appended to the defaults, and the rubric's alias for it is `not_active` (see
// enforcement.ALIAS). A token that is NOT registered replaces the option list
// outright -- both parsers agree on that, and writing the alias here instead of the
// registered token gave `options: ['not_active']`, which is why the first draft of
// this file failed.
const SLOTS = parseSlots(
  'behavior_1:First example:wrong_kind@1.5|b1_basis:What the entry is',
  ['met', 'absent', 'unclear'],
);
const SPEC = 'behavior_1:b1_basis:activity~met,none~absent,*~wrong_kind';

describe('maps: one pick, several named verdicts', () => {
  it('parses pairs and the fallback', () => {
    const [r] = parseMaps(SPEC);
    expect(r.key).toBe('behavior_1');
    expect(r.pick).toBe('b1_basis');
    expect(r.pairs).toEqual([
      { value: 'activity', verdict: 'met' },
      { value: 'none', verdict: 'absent' },
    ]);
    expect(r.fallback).toBe('wrong_kind');
  });

  it('maps a named value, and falls back for the rest', () => {
    const [r] = parseMaps(SPEC);
    expect(mappedVerdict(r, { b1_basis: { verdict: 'activity' } })).toBe('met');
    expect(mappedVerdict(r, { b1_basis: { verdict: 'none' } })).toBe('absent');
    expect(mappedVerdict(r, { b1_basis: { verdict: 'consequence' } })).toBe('wrong_kind');
  });

  it('reads a pick answered as `refers_to`, like the other primitives', () => {
    const [r] = parseMaps(SPEC);
    expect(mappedVerdict(r, { b1_basis: { refers_to: 'activity' } })).toBe('met');
  });

  it('leaves the check unmapped when the pick is unanswered', () => {
    const [r] = parseMaps(SPEC);
    expect(mappedVerdict(r, {})).toBeUndefined();
    // and unmapped reads as not satisfied rather than as credit
    const sat = satisfiedMap(SLOTS, {}, [], [], [], [], [], [], [r]);
    expect(sat.behavior_1).toBe(false);
  });

  it('with no fallback, an unlisted value maps to nothing rather than guessing', () => {
    const [r] = parseMaps('behavior_1:b1_basis:activity~met');
    expect(r.fallback).toBeUndefined();
    expect(mappedVerdict(r, { b1_basis: { verdict: 'consequence' } })).toBeUndefined();
  });

  it('a mapped verdict is satisfied on the same terms as an answered one', () => {
    const [r] = parseMaps(SPEC);
    expect(satisfiedMap(SLOTS, { b1_basis: { verdict: 'activity' } },
                        [], [], [], [], [], [], [r]).behavior_1).toBe(true);
    expect(satisfiedMap(SLOTS, { b1_basis: { verdict: 'consequence' } },
                        [], [], [], [], [], [], [r]).behavior_1).toBe(false);
  });

  it('charges the points once, whichever failure it is', () => {
    const [r] = parseMaps(SPEC);
    const score = (basis: string) =>
      scoreSlotSheet(SLOTS, { b1_basis: { verdict: basis } }, undefined,
                     [], [], [], [], [], [], [], [r]);
    expect(score('activity')?.score).toBe(1.5);
    expect(score('none')?.score).toBe(0);
    expect(score('consequence')?.score).toBe(0);
  });

  it('does what two forbid rules on one key CANNOT', () => {
    // The trap this primitive replaces. Every implementation ASSIGNS the computed
    // check per rule, so with two rules the last one wins -- and the direction is
    // the dangerous one: a failing first rule is overwritten back to satisfied, so
    // a wrong entry gets CREDITED.
    const two = parseForbid('behavior_1:b1_basis=consequence|behavior_1:b1_basis=none');
    const satTwo = satisfiedMap(SLOTS, { b1_basis: { verdict: 'consequence' } },
                                [], [], [], [], [], two);
    expect(satTwo.behavior_1).toBe(true);          // wrong, and silently so

    const [r] = parseMaps(SPEC);
    const satMap = satisfiedMap(SLOTS, { b1_basis: { verdict: 'consequence' } },
                                [], [], [], [], [], [], [r]);
    expect(satMap.behavior_1).toBe(false);         // what we actually meant
  });
});


// THE b6d3f070 REGRESSION. Stopping the ask is only safe while the map actually
// REACHES the scorer. When it did not -- SlotSheetGrader passed ten arguments to
// an eleven-argument scoreSlotSheet -- dropping the ask left the mapped key with
// a verdict from neither source, so every mapped check was charged on every cell
// and the items scored flat (Q4a 1.00 on 120/120, Q4b 2.00 on 114).
//
// The other half of that pair is `charges the points once, whichever failure it
// is` above: it scores from the pick alone and would fail the moment the map
// stopped reaching the scorer. This one asserts the ask is gone. Together they
// are what b6d3f070 needed and did not have.
describe('a mapped slot is computed, not asked', () => {
  it('leaves the response schema, while its pick stays', () => {
    const schema = buildSlotSchema(SLOTS, [], [], [], false, [], {}, [], [],
                                   parseMaps(SPEC)) as any;
    const asked = Object.keys((schema.properties as any).checks.properties);
    expect(asked).toContain('b1_basis');      // the pick is still answered
    expect(asked).not.toContain('behavior_1'); // the mapped verdict is not
  });
});


// WHAT THE STUDENT READS on a check nobody answered. A mapped verdict is
// computed, so the raw verdict is empty and the line used to render as
//   - ✓ **First example** — not reported
// a tick against no words, on the check that carries the item's points, while
// the sentence explaining it sat under the classification line below marked `–`.
// The fields were never missing: the PICK carries `evidence` and `note` and the
// grader fills them. They were being read off the wrong key.
describe('a mapped check tells the student what it decided', () => {
  const [rule] = parseMaps(SPEC);
  const CHECKS = {
    b1_basis: { refers_to: 'consequence',
                evidence: 'you wrote "I would feel better"',
                note: 'That names how it turns out, not what you do instead.' },
  };
  const out = composeSlotFeedback(SLOTS, { checks: CHECKS }, { maps: [rule] });

  it('shows the verdict the map computed, not "not reported"', () => {
    expect(out).toContain('**First example** — not the kind of thing asked for');
    expect(out).not.toContain('**First example** — not reported');
  });

  it("carries the pick's evidence and note under the scored check", () => {
    expect(out).toContain('you wrote "I would feel better"');
    expect(out).toContain('That names how it turns out, not what you do instead.');
    // ONCE, not twice: the pick hands them up rather than printing its own copy.
    expect((out.match(/I would feel better/g) ?? []).length).toBe(1);
  });
});
