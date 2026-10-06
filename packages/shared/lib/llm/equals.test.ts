// Computed checks: the grader compares, the model only reports the operands.
//
// The case these exist for is Handout 2's operant-conditioning items. The sheet
// already asks which of the four types an example ACTUALLY is (`observed_type`)
// and which the student SAID they would use (`named_type`). Asking a third check
// whether those match adds a judgement the model cannot get more right than
// `===` can, and can get wrong — and on DAY1/WK1/DAY2/WK2 that check carries 2 of
// the item's 4 points.

import { describe, it, expect } from 'vitest';
import {
  parseEquals,
  parseSlots,
  satisfiedMap,
  scoreSlotSheet,
  failedGate,
  buildSlotSchema,
  computedVerdict,
} from './slotSheet';

const SPEC =
  'observed_type:What it is:PR/NR/PP/NP/none|' +
  'named_type:What you chose:PR/NR/PP/NP/unclear|' +
  'matches_chosen_type:Matches your chosen type:yes/no@2|' +
  'targets_own_behavior:Aimed at your own behavior:yes/no@1';
const EQ = 'matches_chosen_type:observed_type,named_type';
const slots = parseSlots(SPEC);
const equals = parseEquals(EQ);
const v = (obs: string, named: string, targets = 'yes') => ({
  observed_type: { verdict: obs },
  named_type: { verdict: named },
  targets_own_behavior: { verdict: targets },
});

describe('parseEquals', () => {
  it('reads rules', () => {
    expect(parseEquals('a:b,c|d:e,f')).toEqual([
      { key: 'a', left: 'b', right: 'c', lenient: [] },
      { key: 'd', left: 'e', right: 'f', lenient: [] },
    ]);
    expect(parseEquals('a:b,c:unclear,none')).toEqual([
      { key: 'a', left: 'b', right: 'c', lenient: ['unclear', 'none'] },
    ]);
  });

  it('is empty for absent or malformed input', () => {
    expect(parseEquals(undefined)).toEqual([]);
    expect(parseEquals('')).toEqual([]);
    expect(parseEquals('nooperands')).toEqual([]);
    expect(parseEquals('k:onlyone')).toEqual([]);
  });
});

describe('satisfiedMap with a computed check', () => {
  it('is satisfied when the operands agree', () => {
    expect(satisfiedMap(slots, v('NR', 'NR'), [], equals).matches_chosen_type).toBe(true);
  });

  it('is unsatisfied when they differ', () => {
    expect(satisfiedMap(slots, v('NP', 'NR'), [], equals).matches_chosen_type).toBe(false);
  });

  it('is unsatisfied when either operand is missing — a match cannot be established', () => {
    expect(satisfiedMap(slots, { named_type: { verdict: 'NR' } }, [], equals)
      .matches_chosen_type).toBe(false);
    expect(satisfiedMap(slots, { observed_type: { verdict: 'NR' } }, [], equals)
      .matches_chosen_type).toBe(false);
  });

  it('ignores any verdict the model supplied for the computed check', () => {
    const checks = { ...v('NP', 'NR'), matches_chosen_type: { verdict: 'yes' } };
    expect(satisfiedMap(slots, checks, [], equals).matches_chosen_type).toBe(false);
  });

  it('leaves the other checks on their own rules', () => {
    const got = satisfiedMap(slots, v('NR', 'NR', 'no'), [], equals);
    expect(got.targets_own_behavior).toBe(false);
    // `observed_type` is informational: its first option is PR, so a verdict of
    // NR is not "satisfied" in the first-verdict sense. Unscored, so it costs
    // nothing — but it must not be silently flipped by the equals rule.
    expect(got.observed_type).toBe(false);
  });
});

describe('scoreSlotSheet with a computed check', () => {
  it('charges the check when the operands differ', () => {
    expect(scoreSlotSheet(slots, v('NP', 'NR'), 4, [], equals))
      .toEqual({ score: 2, max: 4, failed: ['matches_chosen_type'], deductions: [] });
  });

  it('charges nothing when they agree', () => {
    expect(scoreSlotSheet(slots, v('NR', 'NR'), 4, [], equals))
      .toEqual({ score: 4, max: 4, failed: [], deductions: [] });
  });

  it('stacks with an ordinary check', () => {
    expect(scoreSlotSheet(slots, v('NP', 'NR', 'no'), 4, [], equals))
      .toEqual({ score: 1, max: 4, failed: ['matches_chosen_type', 'targets_own_behavior'], deductions: [] });
  });
});

describe('a computed check that gates', () => {
  const gated = parseSlots(
    'defines_type:What it defines:PR/NR/PP/NP/unclear|' +
    'named_type:What you chose:PR/NR/PP/NP/unclear|' +
    '!matches_chosen_type:Definition matches your choice:met/absent|' +
    'add_or_remove:Added or taken away:met/absent@1');
  const geq = parseEquals('matches_chosen_type:defines_type,named_type');
  const g = (d: string, n: string) => ({
    defines_type: { verdict: d }, named_type: { verdict: n },
    add_or_remove: { verdict: 'met' },
  });

  it('does not fire when the definition matches the choice', () => {
    expect(failedGate(gated, g('NP', 'NP'), [], geq)).toBeNull();
    expect(scoreSlotSheet(gated, g('NP', 'NP'), 2, [], geq)?.score).toBe(2);
  });

  it('zeroes the item when it does not', () => {
    expect(failedGate(gated, g('NP', 'NR'), [], geq)?.key).toBe('matches_chosen_type');
    expect(scoreSlotSheet(gated, g('NP', 'NR'), 2, [], geq)?.score).toBe(0);
  });
});

describe('the computed check is not asked for', () => {
  it('is absent from the schema properties and required list', () => {
    const schema: any = buildSlotSchema(slots, equals);
    const props = schema.properties.checks.properties;
    expect(Object.keys(props)).not.toContain('matches_chosen_type');
    expect(schema.properties.checks.required).not.toContain('matches_chosen_type');
    expect(Object.keys(props)).toContain('observed_type');
  });

  it('is still asked for when no equals rule names it', () => {
    const schema: any = buildSlotSchema(slots, []);
    expect(Object.keys(schema.properties.checks.properties)).toContain('matches_chosen_type');
  });
});

describe('lenient operands — a mismatch that cannot be established is not charged', () => {
  // Mirrors score.py:derive_oc_ledger's `named != "unclear" && observed != named`.
  const leq = parseEquals('matches_chosen_type:observed_type,named_type:unclear');

  it('is satisfied when an operand says it cannot tell', () => {
    expect(satisfiedMap(slots, v('NP', 'unclear'), [], leq).matches_chosen_type).toBe(true);
    expect(scoreSlotSheet(slots, v('NP', 'unclear'), 4, [], leq)?.score).toBe(4);
  });

  it('still charges a mismatch between two real values', () => {
    expect(satisfiedMap(slots, v('NP', 'NR'), [], leq).matches_chosen_type).toBe(false);
  });

  it('still credits a genuine match', () => {
    expect(satisfiedMap(slots, v('NR', 'NR'), [], leq).matches_chosen_type).toBe(true);
  });

  it('says so in the displayed verdict', () => {
    expect(computedVerdict(leq[0], v('NP', 'unclear'))).toBe('not established');
  });

  it('without the clause, `unclear` would be charged — the divergence this avoids', () => {
    expect(satisfiedMap(slots, v('NP', 'unclear'), [], equals).matches_chosen_type).toBe(false);
  });
});

describe('computedVerdict, for display', () => {
  it('reports a match', () => {
    expect(computedVerdict(equals[0], v('NR', 'NR'))).toBe('matches');
  });
  it('reports the disagreement', () => {
    expect(computedVerdict(equals[0], v('NP', 'NR'))).toBe('NP vs NR');
  });
  it('reports an unanswered operand', () => {
    expect(computedVerdict(equals[0], { named_type: { verdict: 'NR' } })).toBe('not reported');
  });
});


// WHAT THE STUDENT READ, which is not what the score was computed from.
// `satisfiedMap` reads an operand as `refers_to ?? verdict`; `computedVerdict`
// -- the DISPLAY path -- read only `.verdict`. Every shipped `equals` compares
// two CLASSIFICATIONS, which answer `refers_to` and leave `verdict` empty, so
// the line rendered `not reported` beside a tick the score had earned: 334
// recorded lines on DAY1, DAY2, WK1 and WK2, plus 240 on D1/D2.
describe('a computed check displays what it was computed from', () => {
  const [rule] = parseEquals('matches_chosen_type:observed_type,named_type:unclear');

  it('reads a classification from refers_to, as scoring does', () => {
    expect(computedVerdict(rule, {
      observed_type: { refers_to: 'PR' }, named_type: { refers_to: 'PR' },
    })).toBe('matches');
    expect(computedVerdict(rule, {
      observed_type: { refers_to: 'PR' }, named_type: { refers_to: 'NR' },
    })).toBe('PR vs NR');
  });

  it('still says `not reported` only when nothing was answered', () => {
    expect(computedVerdict(rule, {})).toBe('not reported');
  });
});
