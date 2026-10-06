// `requires`: a check is CREDITED only while another one holds.
//
// The mirror image of `onlyif`, which decides what may be CHARGED. Both exist
// because a rubric's slots are not always independent, but they suppress
// opposite things, and conflating them costs points in opposite directions.
//
// Handout 1's Q6 is the case it was built for. Its eight scored slots are four
// (element, treatment) pairs, and the sheet asks each consequence box whether
// its consequence is named and whether an effect is described — never which
// antecedent's change PRODUCES that effect. A response that addresses one
// antecedent in a single run-on sentence could therefore bank both consequence
// pairs off one clause, where the graders charge the whole second half. Asking
// the linkage as its own check gives `cover` a duplicate to see; `requires` is
// what carries that answer to the pair, which is scored on OTHER slots.
//
// The `lenient` segment exists because the first measured version denied a whole
// pair when the linkage check came back `unclear` — charging the student for the
// grader declining to say. Same word, same meaning as in `equals`/`expect`.

import { describe, it, expect } from 'vitest';
import {
  parseRequires,
  parseSlots,
  parseCover,
  satisfiedMap,
  scoreSlotSheet,
  DEFAULT_VERDICTS,
} from './slotSheet';

const SPEC =
  'state_c1:First consequence named:mismatch@1.25|' +
  'affect_c1:How the first consequence is affected:incomplete@1.25|' +
  'state_c2:Second consequence named:mismatch@1.25|' +
  'affect_c2:How the second consequence is affected:incomplete@1.25|' +
  'link_c1:Which change the first consequence follows from|' +
  'link_c2:Which change the second consequence follows from';

const slots = parseSlots(SPEC, DEFAULT_VERDICTS);
const cover = parseCover('link_c1,link_c2:first,second');
const RULES =
  'state_c1:link_c1:unclear|affect_c1:link_c1:unclear|' +
  'state_c2:link_c2:unclear|affect_c2:link_c2:unclear';
const requires = parseRequires(RULES);

/** All four scored slots satisfied; the two linkage checks answered as given. */
const sheet = (l1: unknown, l2: unknown) => ({
  state_c1: { verdict: 'met' },
  affect_c1: { verdict: 'met' },
  state_c2: { verdict: 'met' },
  affect_c2: { verdict: 'met' },
  link_c1: l1 as never,
  link_c2: l2 as never,
});

const answered = (v: string, refers: string) => ({ verdict: v, refers_to: refers });

describe('parseRequires', () => {
  it('reads key, condition and an optional lenient list', () => {
    expect(parseRequires('a:b|c:d:unclear,none')).toEqual([
      { key: 'a', cond: 'b', lenient: [] },
      { key: 'c', cond: 'd', lenient: ['unclear', 'none'] },
    ]);
  });

  it('drops entries missing either half, and tolerates an empty spec', () => {
    expect(parseRequires('a|:b|c:')).toEqual([]);
    expect(parseRequires(undefined)).toEqual([]);
  });
});

describe('requires', () => {
  it('denies nothing while both conditions hold', () => {
    const sat = satisfiedMap(
      slots, sheet(answered('met', 'first'), answered('met', 'second')),
      cover, [], [], [], requires);
    expect(sat.state_c1 && sat.affect_c1 && sat.state_c2 && sat.affect_c2).toBe(true);
  });

  it('denies the pair whose condition names the same item as the other', () => {
    // The Q6 case: one antecedent changed, both consequences hung off it, so
    // `cover` demotes the second claimant and `requires` carries that to its pair.
    const sat = satisfiedMap(
      slots, sheet(answered('met', 'first'), answered('met', 'first')),
      cover, [], [], [], requires);
    expect(sat.state_c1).toBe(true);
    expect(sat.affect_c1).toBe(true);
    expect(sat.state_c2).toBe(false);
    expect(sat.affect_c2).toBe(false);
  });

  it('costs the dependent pair its points, not the condition, which is unscored', () => {
    const both = scoreSlotSheet(
      slots, sheet(answered('met', 'first'), answered('met', 'second')),
      undefined, cover, [], [], [], [], requires);
    const dup = scoreSlotSheet(
      slots, sheet(answered('met', 'first'), answered('met', 'first')),
      undefined, cover, [], [], [], [], requires);
    expect(both?.score).toBe(5);
    expect(dup?.score).toBe(2.5);
  });

  it('a lenient condition establishes nothing, so it denies nothing', () => {
    const sat = satisfiedMap(
      slots, sheet(answered('met', 'first'), { verdict: 'unclear' }),
      cover, [], [], [], requires);
    expect(sat.state_c2).toBe(true);
    expect(sat.affect_c2).toBe(true);
  });

  it('still denies on a NON-lenient failure of the condition', () => {
    const sat = satisfiedMap(
      slots, sheet(answered('met', 'first'), { verdict: 'absent' }),
      cover, [], [], [], requires);
    expect(sat.state_c2).toBe(false);
    expect(sat.affect_c2).toBe(false);
  });

  it('an unknown condition denies nothing, so a typo cannot silently zero a pair', () => {
    const typo = parseRequires('state_c2:link_c9');
    const sat = satisfiedMap(
      slots, sheet(answered('met', 'first'), answered('met', 'first')),
      cover, [], [], [], typo);
    expect(sat.state_c2).toBe(true);
  });

  it('is not transitive: a denial does not propagate through a second rule', () => {
    // Same deliberate limit `chargedMap` documents — a chain of two reads the
    // way the attribute looks, rather than through a silent closure.
    const chain = parseRequires('affect_c1:state_c1|state_c1:link_c1');
    const sat = satisfiedMap(
      slots, sheet({ verdict: 'absent' }, answered('met', 'second')),
      cover, [], [], [], chain);
    expect(sat.state_c1).toBe(false);   // denied by link_c1
    expect(sat.affect_c1).toBe(true);   // NOT denied by state_c1's later denial
  });
});
