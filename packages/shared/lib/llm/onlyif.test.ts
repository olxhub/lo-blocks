// Charge-once: one deduction, two possible causes, never billed twice.
//
// Handout 2's four "write an example of PR/NR/PP/NP" items charge WRONG_TYPE (-2)
// for an example of the wrong type, and the SAME code for a right-type example
// aimed at the wrong behaviour. `score.py:derive_oc_ledger` uses `elif`, so at
// most one -2 lands. Two independently-scored checks charge 4.
//
// The prompt used to buy the arithmetic by telling the model to report `yes` on
// the second check whenever the first failed — a verdict that is false about the
// student's answer, and shown to the student. Here satisfaction stays honest and
// only the charge is suppressed, which is what the rubric itself does: its check
// list records the real value while its ledger declines to bill for it.

import { describe, it, expect } from 'vitest';
import {
  parseOnlyIf,
  parseSlots,
  chargedMap,
  satisfiedMap,
  scoreSlotSheet,
  failedGate,
  composeSlotFeedback,
} from './slotSheet';

// The PR item, as authored: `observed_type`'s first option is the type the item
// asks for, so satisfaction means "it really is PR".
const SPEC =
  '!names_behavior:Names a behavior|' +
  'observed_type:Which of the four types this actually is:PR/NR/PP/NP/none@2|' +
  'targets_goal_behavior:Aimed at increasing your goal behavior:yes/no@2';
// The authored sheet sets verdicts="yes,no,unclear", so the gates that name no
// options of their own take THAT default rather than met/absent/unclear.
const slots = parseSlots(SPEC, ['yes', 'no', 'unclear']);
const onlyif = parseOnlyIf('targets_goal_behavior:observed_type');

const v = (observed: string, targets: string, behavior = 'yes') => ({
  names_behavior: { verdict: behavior },
  observed_type: { verdict: observed },
  targets_goal_behavior: { verdict: targets },
});
const score = (observed: string, targets: string) =>
  scoreSlotSheet(slots, v(observed, targets), 4, [], [], onlyif);

describe('parseOnlyIf', () => {
  it('reads rules', () => {
    expect(parseOnlyIf('a:b|c:d')).toEqual([
      { key: 'a', cond: 'b' },
      { key: 'c', cond: 'd' },
    ]);
  });

  it('is empty for absent or malformed input', () => {
    expect(parseOnlyIf(undefined)).toEqual([]);
    expect(parseOnlyIf('')).toEqual([]);
    expect(parseOnlyIf('nocondition')).toEqual([]);
    expect(parseOnlyIf(':b')).toEqual([]);
  });
});

describe('the four causes, on a 4-point item', () => {
  it('right type, right target — full marks', () => {
    expect(score('PR', 'yes')).toEqual({ score: 4, max: 4, failed: [], deductions: [] });
  });

  it('right type, WRONG target — charges the target check', () => {
    expect(score('PR', 'no'))
      .toEqual({ score: 2, max: 4, failed: ['targets_goal_behavior'], deductions: [] });
  });

  it('WRONG type, right target — charges the type check', () => {
    expect(score('NP', 'yes')).toEqual({ score: 2, max: 4, failed: ['observed_type'], deductions: [] });
  });

  it('WRONG type AND wrong target — still charges only 2, the whole point', () => {
    expect(score('NP', 'no')).toEqual({ score: 2, max: 4, failed: ['observed_type'], deductions: [] });
  });

  it('without the rule that last case charges 4 — the divergence this avoids', () => {
    expect(scoreSlotSheet(slots, v('NP', 'no'), 4, [], [], []))
      .toEqual({ score: 0, max: 4, failed: ['observed_type', 'targets_goal_behavior'], deductions: [] });
  });

  it('a failed gate still zeroes the item', () => {
    expect(scoreSlotSheet(slots, v('PR', 'yes', 'no'), 4, [], [], onlyif))
      .toEqual({ score: 0, max: 4, failed: ['names_behavior'], deductions: [] });
  });
});

describe('satisfaction stays honest', () => {
  it('reports the real verdict even when the charge is suppressed', () => {
    // The reason for the whole design: the model answers `no` truthfully and the
    // grader, not the prompt, decides it costs nothing.
    expect(satisfiedMap(slots, v('NP', 'no')).targets_goal_behavior).toBe(false);
    expect(chargedMap(slots, satisfiedMap(slots, v('NP', 'no')), onlyif)
      .targets_goal_behavior).toBe(false);
  });

  it('charges normally once the condition holds', () => {
    const sat = satisfiedMap(slots, v('PR', 'no'));
    expect(chargedMap(slots, sat, onlyif).targets_goal_behavior).toBe(true);
  });

  it('leaves unconditioned checks chargeable', () => {
    const sat = satisfiedMap(slots, v('NP', 'no'));
    expect(chargedMap(slots, sat, onlyif).observed_type).toBe(true);
  });
});

describe('chargedMap edge cases', () => {
  it('suppresses nothing when no rules are declared', () => {
    const sat = satisfiedMap(slots, v('NP', 'no'));
    expect(chargedMap(slots, sat, [])).toEqual({
      names_behavior: true, observed_type: true, targets_goal_behavior: true,
    });
  });

  it('ignores a rule naming an unknown condition — a typo must not grant credit', () => {
    const sat = satisfiedMap(slots, v('NP', 'no'));
    expect(chargedMap(slots, sat, parseOnlyIf('targets_goal_behavior:typo'))
      .targets_goal_behavior).toBe(true);
  });

  it('does not chain: suppression of a condition does not propagate', () => {
    const three = parseSlots('a:A:yes/no@1|b:B:yes/no@1|c:C:yes/no@1');
    const rules = parseOnlyIf('b:a|c:b');
    const checks = { a: { verdict: 'no' }, b: { verdict: 'no' }, c: { verdict: 'no' } };
    const charged = chargedMap(three, satisfiedMap(three, checks), rules);
    expect(charged.b).toBe(false);          // a failed, so b is moot
    expect(charged.c).toBe(false);          // b is UNSATISFIED, so c is moot too
    // c's suppression follows b's satisfaction, not b's chargeability.
    expect(scoreSlotSheet(three, checks, 3, [], [], rules))
      .toEqual({ score: 2, max: 3, failed: ['a'], deductions: [] });
  });
});

describe('a gate that is moot does not fire', () => {
  const gated = parseSlots(
    'observed_type:What it is:PR/NR/PP/NP/none@2|!targets_goal_behavior:Aimed right:yes/no');
  const rules = parseOnlyIf('targets_goal_behavior:observed_type');

  it('fires when its condition holds', () => {
    expect(failedGate(gated, v('PR', 'no'), [], [], rules)?.key).toBe('targets_goal_behavior');
  });

  it('does not fire when its condition failed', () => {
    expect(failedGate(gated, v('NP', 'no'), [], [], rules)).toBeNull();
    // ...so the item keeps the points the type check did not take.
    expect(scoreSlotSheet(gated, v('NP', 'no'), 4, [], [], rules)?.score).toBe(2);
  });
});

describe('the student sees why it was not counted', () => {
  it('marks a suppressed check and says it was not counted separately', () => {
    const out = composeSlotFeedback(slots, { checks: v('NP', 'no'), feedback: 'ok' },
      { onlyif });
    expect(out).toContain('· **Aimed at increasing your goal behavior** — no (not counted separately)');
  });

  it('says nothing extra when the check IS counted', () => {
    const out = composeSlotFeedback(slots, { checks: v('PR', 'no'), feedback: 'ok' },
      { onlyif });
    expect(out).toContain('· **Aimed at increasing your goal behavior** — no');
    expect(out).not.toContain('not counted separately');
  });

  it('says nothing extra when the check is satisfied', () => {
    const out = composeSlotFeedback(slots, { checks: v('NP', 'yes'), feedback: 'ok' },
      { onlyif });
    expect(out).toContain('✓ **Aimed at increasing your goal behavior** — yes');
    expect(out).not.toContain('not counted separately');
  });
});
