import { describe, expect, it } from 'vitest';
import {
  parseForbid,
  parseExpect,
  forbidden,
  satisfiedMap,
  buildSlotSchema,
  failedGate,
  parseSlots,
} from './slotSheet';

const SPEC = 'consequence_not_a_setup:restriction_authored=created,trigger_expects=gain';
const SLOTS = parseSlots(
  'restriction_authored:Authored:created/relieved/neither' +
    '|trigger_expects:Expects:gain/loss/none' +
    '|!consequence_not_a_setup:Not a setup',
);
const v = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, verdict]) => [k, { verdict }]));

describe('parseForbid', () => {
  it('parses a key and its conditions', () => {
    expect(parseForbid(SPEC)).toEqual([
      {
        key: 'consequence_not_a_setup',
        conds: [
          { slot: 'restriction_authored', value: 'created' },
          { slot: 'trigger_expects', value: 'gain' },
        ],
      },
    ]);
  });

  it('parses several rules', () => {
    expect(parseForbid('a:x=1|b:y=2')).toEqual([
      { key: 'a', conds: [{ slot: 'x', value: '1' }] },
      { key: 'b', conds: [{ slot: 'y', value: '2' }] },
    ]);
  });

  it('drops entries with no usable conditions', () => {
    expect(parseForbid(undefined)).toEqual([]);
    expect(parseForbid('')).toEqual([]);
    expect(parseForbid('nokey')).toEqual([]);
    expect(parseForbid('k:novalue')).toEqual([]);
    expect(parseForbid('k:=novalue')).toEqual([]);
  });
});

describe('forbidden', () => {
  const [rule] = parseForbid(SPEC);

  it('holds only when EVERY condition matches', () => {
    expect(
      forbidden(rule, v({ restriction_authored: 'created', trigger_expects: 'gain' })),
    ).toBe(true);
  });

  // The whole point of the primitive: `created` on its own is not the fault. An
  // ordinary punishment contingency creates a deprivation too, and imposes it
  // for FAILING, which is why the second condition has to be met as well.
  it('does not hold when the deprivation is imposed for failing', () => {
    expect(
      forbidden(rule, v({ restriction_authored: 'created', trigger_expects: 'loss' })),
    ).toBe(false);
  });

  it('does not hold when the first condition alone matches', () => {
    expect(
      forbidden(rule, v({ restriction_authored: 'relieved', trigger_expects: 'gain' })),
    ).toBe(false);
  });

  // A classification answers `refers_to`, not `verdict`. Reading the verdict
  // alone made the rule never fire on the pick slots it exists for; the
  // enforcement probe caught it before the rule was ever measured.
  it('reads a pick answer from refers_to', () => {
    expect(
      forbidden(rule, {
        restriction_authored: { refers_to: 'created' },
        trigger_expects: { refers_to: 'gain' },
      }),
    ).toBe(true);
    expect(
      forbidden(rule, {
        restriction_authored: { refers_to: 'created' },
        trigger_expects: { refers_to: 'loss' },
      }),
    ).toBe(false);
  });

  // A gate must not fire on missing data: a false zero costs a whole item.
  it('does not hold when an operand is unanswered', () => {
    expect(forbidden(rule, v({ restriction_authored: 'created' }))).toBe(false);
    expect(forbidden(rule, v({ trigger_expects: 'gain' }))).toBe(false);
    expect(forbidden(rule, {})).toBe(false);
  });
});

describe('satisfiedMap with forbid', () => {
  const forbid = parseForbid(SPEC);

  it('fails the check when the combination holds', () => {
    const sat = satisfiedMap(
      SLOTS,
      v({ restriction_authored: 'created', trigger_expects: 'gain' }),
      [], [], [], [], [], forbid,
    );
    expect(sat.consequence_not_a_setup).toBe(false);
  });

  it('passes otherwise, including on unanswered operands', () => {
    for (const checks of [
      v({ restriction_authored: 'created', trigger_expects: 'loss' }),
      v({ restriction_authored: 'neither', trigger_expects: 'gain' }),
      {},
    ]) {
      const sat = satisfiedMap(SLOTS, checks, [], [], [], [], [], forbid);
      expect(sat.consequence_not_a_setup).toBe(true);
    }
  });

  it('gates the item when it fails, and not when it passes', () => {
    const bad = failedGate(
      SLOTS,
      v({ restriction_authored: 'created', trigger_expects: 'gain' }),
      [], [], [], [], [], [], forbid,
    );
    expect(bad?.key).toBe('consequence_not_a_setup');
    const ok = failedGate(
      SLOTS,
      v({ restriction_authored: 'created', trigger_expects: 'loss' }),
      [], [], [], [], [], [], forbid,
    );
    expect(ok).toBeNull();
  });
});

describe('buildSlotSchema with forbid', () => {
  it('omits the derived key, so the model is never asked for it', () => {
    const schema = buildSlotSchema(SLOTS, [], [], [], false, [], {}, [], parseForbid(SPEC)) as any;
    const props = schema.properties.checks.properties;
    expect(Object.keys(props)).toContain('restriction_authored');
    expect(Object.keys(props)).toContain('trigger_expects');
    expect(Object.keys(props)).not.toContain('consequence_not_a_setup');
  });
});

describe('a computed rule may name the verdict it sets on failure', () => {
  // `->verdict` exists because the failing verdict used to be POSITIONAL, and the
  // three implementations resolved the position differently: one python engine took
  // the last option of the slot's vocabulary, the other took the second. Every
  // computed check in the current content has exactly two options, so those
  // coincide and the implementations agreed by luck. The disagreement appears on
  // the first three-option computed check -- e.g. Q4b's behavior_* slots, where
  // `absent` means "you only gave one example" and `not_active` means "present but
  // not something done instead", which are different things to tell a student.
  it('strips the arrow so the key still resolves to a slot', () => {
    const [r] = parseForbid('behavior_1->not_active:b1_basis=consequence');
    expect(r.key).toBe('behavior_1');
    expect(r.fails).toBe('not_active');
    expect(r.conds).toEqual([{ slot: 'b1_basis', value: 'consequence' }]);
  });

  it('leaves a rule without an arrow exactly as before', () => {
    const [r] = parseForbid(SPEC);
    expect(r.key).toBe('consequence_not_a_setup');
    expect(r.fails).toBeUndefined();
  });

  it('reads it on `expect` too', () => {
    const [r] = parseExpect('behavior_1->not_active:b1_basis=activity:');
    expect(r.key).toBe('behavior_1');
    expect(r.fails).toBe('not_active');
    expect(r.left).toBe('b1_basis');
    expect(r.value).toBe('activity');
  });

  it('an unstripped key would compute nothing, which is why this matters', () => {
    // The failure mode being guarded: with the arrow left on, no slot matches the
    // key, so the check it names is never written and never charged -- silently.
    const slots = parseSlots(
      'behavior_1:First example:not_active@1.5|b1_basis:What it is',
      ['met', 'absent', 'not_active'],
    );
    const rules = parseForbid('behavior_1->not_active:b1_basis=consequence');
    const sat = satisfiedMap(slots, { b1_basis: { verdict: 'consequence' } }, [], [], [], [], [], rules);
    expect(Object.keys(sat)).toContain('behavior_1');
    expect(sat.behavior_1).toBe(false);
  });
});
