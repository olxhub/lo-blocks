// FIRE TESTS. Goal K's standing obligation: "a ported check must FIRE on the
// case its python original fires on, proved by the same fire test, before the
// original retires." A test that only asserts the clean corpus stays clean
// certifies nothing — every one of these rules reports zero today, so a rule
// deleted to `return []` would pass a corpus-only suite.

import { describe, expect, it } from 'vitest';
import { PROBES, RULES, caseNamesInPrompts } from './index';

// The probe under its registry name, so the tests exercise the path python uses.
const RULES_PROBE = (p: any) => PROBES.score_recorded_sheets(p) as any[];

describe('no_case_names_in_prompts', () => {
  it('FIRES on a prompt that names a cohort case', () => {
    const f = caseNamesInPrompts([{ item: 'Q6', text: 'Unlike p10, be specific.' }]);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Q6');
    expect(f[0]).toContain("['p10']");
  });

  it('reports every distinct case once, sorted', () => {
    const f = caseNamesInPrompts([
      { item: 'Q2', text: 'p3 did this, p3 again, and p12 did that.' },
    ]);
    expect(f[0]).toContain("['p12', 'p3']");   // sorted as strings, as Python sorts
  });

  it('is silent on a clean prompt', () => {
    expect(caseNamesInPrompts([{ item: 'Q1', text: 'Name the behaviour.' }]))
      .toEqual([]);
  });

  // THE TWO DETAILS THAT MAKE IT THE SAME CHECK. Both were wrong in the first
  // draft of this port, and neither would have shown up against the live corpus.
  it('does NOT fire on a corpus reference path', () => {
    expect(caseNamesInPrompts([
      { item: 'Q1', text: '{{corpus:Q1/p10:response:0:41:sha=c874ac86a7b2}}' },
    ])).toEqual([]);
  });

  it('does NOT fire on p-digits inside a word', () => {
    expect(caseNamesInPrompts([{ item: 'Q1', text: 'step3 and gap12 and xp4' }]))
      .toEqual([]);
  });

  it('does NOT fire on a three-digit run the cohort cannot contain', () => {
    expect(caseNamesInPrompts([{ item: 'Q1', text: 'p100 is not a participant' }]))
      .toEqual([]);
  });

  it('reaches the rule through the registry name python uses', () => {
    expect(RULES.no_case_names_in_prompts({
      prompts: [{ item: 'Q6', text: 'see p10' }],
    })).toHaveLength(1);
  });

  it('treats a missing payload as nothing to judge, not as a pass to invent', () => {
    expect(RULES.no_case_names_in_prompts({})).toEqual([]);
  });
});

describe('prompt_prose_names_only_offered_verdicts', () => {
  const known = ['met', 'absent', 'unclear', 'not_reason', 'wrong_kind'];
  const slot = (o: Partial<any> = {}) => ({
    item: 'Q5', key: 'example_2', hasRule: false,
    offered: ['met', 'absent', 'wrong_kind'],
    offeredPaper: ['met', 'absent', 'wrong_kind'], ...o,
  });

  it('FIRES on the note that shipped: Q5:example_2 naming `not_reason`', () => {
    const f = RULES.prompt_prose_names_only_offered_verdicts({
      knownVerdicts: known,
      slots: [slot({ note: 'Answer `not_reason` when it is a restatement.' })],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Q5.example_2');
    expect(f[0]).toContain("['not_reason']");
    expect(f[0]).toContain('inert');
  });

  it('is silent when the note names a verdict the slot DOES offer', () => {
    expect(RULES.prompt_prose_names_only_offered_verdicts({
      knownVerdicts: known,
      slots: [slot({ note: 'Answer `wrong_kind` when it is a restatement.' })],
    })).toEqual([]);
  });

  // THE FIRST THING A NAIVE PORT GETS WRONG. `pick(NAME)` options live in the
  // sheet's `choices=` map, not the slot spec; python resolves them into
  // `offered` before calling. With them absent, D1/D2:named_type reads as
  // naming `unclear` against a met/absent slot — two false positives on prose
  // that is correct.
  it('is silent when a pick group supplies the verdict', () => {
    expect(RULES.prompt_prose_names_only_offered_verdicts({
      knownVerdicts: known,
      slots: [slot({
        item: 'D1', key: 'named_type',
        offered: ['met', 'absent', 'unclear'],   // resolved from choices=
        offeredPaper: ['met', 'absent', 'unclear'],
        note: 'Answer `unclear` when no type is named.',
      })],
    })).toEqual([]);
  });

  it('leaves a slot with a `rule` to the check that owns it', () => {
    expect(RULES.prompt_prose_names_only_offered_verdicts({
      knownVerdicts: known,
      slots: [slot({ hasRule: true, note: 'Answer `not_reason`.' })],
    })).toEqual([]);
  });

  it('FIRES on a `desc` naming a token only ONE side offers', () => {
    const f = RULES.prompt_prose_names_only_offered_verdicts({
      knownVerdicts: known,
      slots: [slot({
        offered: ['met', 'absent', 'wrong_kind'],
        offeredPaper: ['met', 'absent'],          // paper lacks it
        desc: 'Mark `wrong_kind` if the example is of another type.',
      })],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('BOTH prompts');
  });

  it('prefers the note over the desc: only one finding per slot', () => {
    const f = RULES.prompt_prose_names_only_offered_verdicts({
      knownVerdicts: known,
      slots: [slot({ note: 'Answer `not_reason`.', desc: 'Also `not_reason`.' })],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('inert');     // the NOTE arm, not the desc arm
  });
});

// PROBES ANSWER, THEY DO NOT JUDGE. A probe's failure mode is producing
// nothing, or producing a shape python cannot compare — neither of which an
// empty-findings assertion would catch. So each is pinned to a real answer.
describe('probes', () => {
  it('parse_slot_specs returns the compared fields, not the whole parse', () => {
    const got = PROBES.parse_slot_specs({
      specs: ['My unwanted target behavior:met/absent'],
    }) as any[];
    expect(got).toHaveLength(1);
    expect(got[0][0]).toHaveProperty('key');
    expect(got[0][0]).toHaveProperty('label');
    expect(got[0][0]).toHaveProperty('options');
    expect(got[0][0]).toHaveProperty('points');
  });

  it('parse_slot_specs keeps one entry per spec, in order', () => {
    const got = PROBES.parse_slot_specs({
      specs: ['a:met/absent', 'b:met/absent', 'c:met/absent'],
    }) as any[];
    expect(got).toHaveLength(3);
  });

  it('resolve_corpus_refs answers ERROR rather than throwing', () => {
    // A probe that dies on the first bad case hides every case after it, so
    // the contract is that a failure is a VALUE the python side can compare.
    const got = PROBES.resolve_corpus_refs({
      data: {}, refs: ['{{corpus:nope/p1:field:0:1:sha=deadbeefdead}}', 'plain'],
    }) as string[];
    expect(got).toHaveLength(2);
    expect(got[0]).toBe('ERROR');
  });

  it('an unknown probe is not silently a passing rule', () => {
    expect(PROBES.no_such_probe).toBeUndefined();
  });
});

describe('computed_rules_do_not_share_a_key', () => {
  const item = (kinds: Record<string, string[]>) =>
    ({ handout: 2, id: 'Q4b', kinds });

  it('FIRES on two rules of one kind writing one key', () => {
    const f = RULES.computed_rules_do_not_share_a_key({
      items: [item({ forbid: ['b2_basis', 'b2_basis'] })],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('H2 Q4b');
    expect(f[0]).toContain('2 `forbid` rules write `b2_basis`');
    expect(f[0]).toContain('do NOT combine as an OR');
  });

  it('is silent on two rules writing DIFFERENT keys', () => {
    expect(RULES.computed_rules_do_not_share_a_key({
      items: [item({ forbid: ['a', 'b'] })],
    })).toEqual([]);
  });

  // The same key under two DIFFERENT primitives is not the trap: they are
  // separate loops writing separate assignments, in a declared order.
  it('is silent when the key repeats across kinds', () => {
    expect(RULES.computed_rules_do_not_share_a_key({
      items: [item({ forbid: ['k'], expect: ['k'] })],
    })).toEqual([]);
  });

  it('counts three as three, and names the count', () => {
    const f = RULES.computed_rules_do_not_share_a_key({
      items: [item({ equals: ['k', 'k', 'k'] })],
    });
    expect(f[0]).toContain('3 `equals` rules write `k`');
  });

  it('ignores a primitive that does not ASSIGN', () => {
    expect(RULES.computed_rules_do_not_share_a_key({
      items: [item({ cover: ['k', 'k'] })],
    })).toEqual([]);
  });

  it('skips a null key rather than counting it as one', () => {
    expect(RULES.computed_rules_do_not_share_a_key({
      items: [{ handout: 1, id: 'Q1', kinds: { forbid: [null, null] as any } }],
    })).toEqual([]);
  });
});

describe('score_recorded_sheets', () => {
  // REAL SLOT SHAPE. `options` is load-bearing -- `isSatisfied` reads
  // `slot.options.includes(MET)` -- and the artifact's recorded `slots`
  // field does NOT carry it. That is why the sheet comes from the CURRENT
  // <LLMAction> and only `checks`/`max`/`recorded` come from the record.
  const slot = (key: string) =>
    ({ key, label: key.toUpperCase(), options: ['met', 'absent'], pts: 2 });
  const sheet = { slots: [slot('a'), slot('b')] };
  const met = { a: { verdict: 'met' }, b: { verdict: 'met' } };

  it('reproduces a cell the shipped scorer still scores the same', () => {
    const [row] = RULES_PROBE({ sheets: { Q: sheet },
      payloads: [{ id: 'x', item: 'Q', checks: met, max: 4, recorded: 4 }] });
    expect(row.rescored).toBe(4);
    expect(row.same).toBe(true);
  });

  it('REPORTS a cell whose recorded score the scorer no longer produces', () => {
    const [row] = RULES_PROBE({ sheets: { Q: sheet },
      payloads: [{ id: 'x', item: 'Q', checks: met, max: 4, recorded: 2 }] });
    expect(row.rescored).toBe(4);
    expect(row.same).toBe(false);
  });

  // THE TRAP THIS FILE EXISTS TO AVOID. `Math.abs(NaN - x) > 1e-9` is FALSE, so
  // a NaN score once made every cell "match" and a whole run reported perfect
  // agreement. Finiteness must be asserted BEFORE the comparison.
  it('refuses a NaN score instead of calling it a match', () => {
    const [row] = RULES_PROBE({ sheets: { Q: sheet },
      payloads: [{ id: 'x', item: 'Q', checks: met,
                   max: NaN as any, recorded: NaN as any }] });
    expect(row.same).toBe(false);
    expect(row.why ?? '').toContain('finite');
  });

  it('never silently drops a payload whose item has no sheet', () => {
    const [row] = RULES_PROBE({ sheets: {},
      payloads: [{ id: 'x', item: 'MISSING', checks: met, max: 4, recorded: 4 }] });
    expect(row.same).toBe(false);
    expect(row.why).toContain('no sheet');
    expect(row.rescored).toBeNull();
  });

  it('returns one row per payload, so the denominator cannot shrink unseen', () => {
    const rows = RULES_PROBE({ sheets: { Q: sheet }, payloads: [
      { id: '1', item: 'Q', checks: met, max: 4, recorded: 4 },
      { id: '2', item: 'NOPE', checks: met, max: 4, recorded: 4 },
      { id: '3', item: 'Q', checks: met, max: 4, recorded: 0 },
    ] });
    expect(rows).toHaveLength(3);
  });
});

describe('no_cell_is_both_corrected_and_declared', () => {
  it('FIRES on a cell booked in both tables', () => {
    const f = RULES.no_cell_is_both_corrected_and_declared({
      corrected: [{ item: 'Q6', pid: 4, was: 6.0, score: 6.25 }],
      divergences: [{ code: 'GOLD_ROUNDS', cells: [['Q6', 4]] }],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Q6/p4');
    expect(f[0]).toContain('GOLD_ROUNDS');
    expect(f[0]).toContain('counts one finding twice');
  });

  it('is silent when the tables name different cells', () => {
    expect(RULES.no_cell_is_both_corrected_and_declared({
      corrected: [{ item: 'Q6', pid: 4 }],
      divergences: [{ code: 'X', cells: [['Q6', 5]] }],
    })).toEqual([]);
  });

  it('is silent when either table is empty', () => {
    expect(RULES.no_cell_is_both_corrected_and_declared({
      corrected: [{ item: 'Q6', pid: 4 }], divergences: [],
    })).toEqual([]);
  });
});

describe('no_recorded_run_is_verdictless', () => {
  it('does not mistake an unreadable artifact for a clean one', () => {
    // $COURSE_DATA is unset in the test environment, so courseData refuses —
    // and that refusal must ARRIVE as a finding, never as silence.
    const f = RULES.no_recorded_run_is_verdictless({
      artifacts: [{ item: 'Q1', side: 'olx', path: 'nope/Q1.runs.json' }],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('could not be read');
  });

  it('is silent on no artifacts at all', () => {
    expect(RULES.no_recorded_run_is_verdictless({ artifacts: [] })).toEqual([]);
  });
});

describe('courseData', () => {
  it('refuses an unset course variable rather than defaulting', async () => {
    const { courseDir } = await import('./courseData');
    const saved = process.env.COURSE_METADATA;
    delete process.env.COURSE_METADATA;
    expect(() => courseDir('COURSE_METADATA')).toThrow(/is not set/);
    if (saved !== undefined) process.env.COURSE_METADATA = saved;
  });

  it('refuses a path that escapes the course directory', async () => {
    const { readCourseJson } = await import('./courseData');
    process.env.COURSE_METADATA = '/tmp/enforce-test-root';
    expect(() => readCourseJson('COURSE_METADATA', '../../etc/passwd'))
      .toThrow(/outside/);
  });
});

describe('consensus_fixes_are_unique', () => {
  it('FIRES when one box is corrected twice', () => {
    const f = RULES.consensus_fixes_are_unique({ entries: [
      { item: 'Q6', pid: 9, fixes: [['trim', 'state_a2'], ['assign', 'state_a2']] },
    ] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('state_a2');
    expect(f[0]).toContain('trim then assign');
  });

  // A `swap` names TWO boxes; reading only the first would miss a swap
  // clobbering a box a later trim also names.
  it('reads BOTH boxes of a swap', () => {
    const f = RULES.consensus_fixes_are_unique({ entries: [
      { item: 'Q6', pid: 9, fixes: [['swap', 'a', 'b'], ['trim', 'b']] },
    ] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('`b` twice');
  });

  it('is silent when every fix names a different box', () => {
    expect(RULES.consensus_fixes_are_unique({ entries: [
      { item: 'Q6', pid: 9, fixes: [['trim', 'a'], ['trim', 'b']] },
    ] })).toEqual([]);
  });
});

describe('named_fixtures_still_name_something', () => {
  it('FIRES on a fixture naming an item the course no longer has', () => {
    const f = RULES.named_fixtures_still_name_something({
      fixtures: [{ label: 'gate case', item: 'GONE', why: 'a gold-bound cell' }],
      knownItems: ['Q1', 'Q6'],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('injecting into nothing');
  });

  it('FIRES on a named target with no reason given', () => {
    const f = RULES.named_fixtures_still_name_something({
      fixtures: [{ label: 'x', item: 'Q1', why: '   ' }], knownItems: ['Q1'],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('without a justification');
  });

  it('is silent on a live target with a reason', () => {
    expect(RULES.named_fixtures_still_name_something({
      fixtures: [{ label: 'x', item: 'Q1', why: 'a gold-bound cell' }],
      knownItems: ['Q1'],
    })).toEqual([]);
  });
});

describe('every_item_has_a_findable_slot_sheet', () => {
  const olx = '<LLMAction id="bmod_q1" slots="a"/>\n<DerivedChecks id="bmod_1b" slots="b"/>';

  it('finds a sheet on EITHER element type', () => {
    expect(RULES.every_item_has_a_findable_slot_sheet({
      sheets: [{ item: 'Q1', elementId: 'bmod_q1' },
               { item: '1b', elementId: 'bmod_1b' }], olx,
    })).toEqual([]);
  });

  it('FIRES on an id no element carries', () => {
    const f = RULES.every_item_has_a_findable_slot_sheet({
      sheets: [{ item: 'Q9', elementId: 'bmod_gone' }], olx,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('blind on this item');
  });

  // An empty corpus must not read as "every sheet is findable".
  it('refuses an empty olx rather than passing', () => {
    const f = RULES.every_item_has_a_findable_slot_sheet({
      sheets: [{ item: 'Q1', elementId: 'bmod_q1' }], olx: '',
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('cannot run');
  });

  it('does not match an id that merely shares a prefix', () => {
    const f = RULES.every_item_has_a_findable_slot_sheet({
      sheets: [{ item: 'Q1', elementId: 'bmod_q' }], olx,
    });
    expect(f).toHaveLength(1);
  });
});

describe('generated_attributes_have_a_declaration', () => {
  it('FIRES on an orphaned generated attribute', () => {
    const f = RULES.generated_attributes_have_a_declaration({ attrs: [
      { item: 'Q4b', name: 'forbid', value: 'x:y', backed: false, exempt: false },
    ] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('ORPHAN');
  });

  it('is silent when the rubric backs it', () => {
    expect(RULES.generated_attributes_have_a_declaration({ attrs: [
      { item: 'Q4b', name: 'forbid', value: 'x:y', backed: true, exempt: false },
    ] })).toEqual([]);
  });

  it('is silent when it is a declared hand-authored attribute', () => {
    expect(RULES.generated_attributes_have_a_declaration({ attrs: [
      { item: 'Q4b', name: 'maps', value: 'x', backed: false, exempt: true },
    ] })).toEqual([]);
  });

  it('is silent on an empty placeholder', () => {
    expect(RULES.generated_attributes_have_a_declaration({ attrs: [
      { item: 'Q4b', name: 'expect', value: '   ', backed: false, exempt: false },
    ] })).toEqual([]);
  });
});

describe('every_designed_entry_ships', () => {
  it('FIRES when the designed wording is absent from the shipped prompt', () => {
    const f = RULES.every_designed_entry_ships({
      entries: [{ item: 'Q2', slot: 's', field: 'rule', want: 'answer unclear when' }],
      prompts: { Q2: 'something else entirely' },
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('NOT in');
  });

  // A rebuild may rewrap a line without changing a word.
  it('is whitespace-insensitive', () => {
    expect(RULES.every_designed_entry_ships({
      entries: [{ item: 'Q2', slot: 's', field: 'rule', want: 'answer  unclear\n  when' }],
      prompts: { Q2: 'x answer unclear when y' },
    })).toEqual([]);
  });

  it('reports an item whose prompt could not be built, rather than skipping it', () => {
    const f = RULES.every_designed_entry_ships({
      entries: [{ item: 'Q9', slot: 's', field: 'rule', want: 'text' }], prompts: {},
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('could not be checked');
  });
});

describe('hand_authored_attrs_still_suppress_something', () => {
  it('FIRES when the excused attribute is not present', () => {
    const f = RULES.hand_authored_attrs_still_suppress_something({ entries: [
      { item: 'Q4a', name: 'forbid', why: 'authored', isGenerated: true, present: false },
    ] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('excuses nothing');
  });

  it('FIRES when the name is not a generated attribute at all', () => {
    const f = RULES.hand_authored_attrs_still_suppress_something({ entries: [
      { item: 'Q4a', name: 'nonsense', why: 'x', isGenerated: false, present: true },
    ] });
    expect(f[0]).toContain('not a generated attribute');
  });

  it('is silent on an exemption that still does work', () => {
    expect(RULES.hand_authored_attrs_still_suppress_something({ entries: [
      { item: 'Q4a', name: 'maps', why: 'authored', isGenerated: true, present: true },
    ] })).toEqual([]);
  });
});

describe('ratchets_only_tighten', () => {
  const r = (count: number, budget: number) => ({
    table: 'HANDCODED_ITEM_RULES', budgetName: 'HANDCODED_BUDGET',
    count, budget, unit: 'hand-coded rule',
    advice: 'A declaration is a promise to convert it, not a licence to keep it',
  });

  it('FIRES when the table grew', () => {
    const f = RULES.ratchets_only_tighten({ ratchets: [r(5, 3)] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('2 hand-coded rule(s) were ADDED');
  });

  // UNDER budget is a finding too: the slack is what lets the next entry in.
  it('FIRES when the table shrank and the budget did not follow', () => {
    const f = RULES.ratchets_only_tighten({ ratchets: [r(1, 3)] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('lower it to 1');
    expect(f[0]).toContain('without the audit noticing');
  });

  it('is silent when count equals budget', () => {
    expect(RULES.ratchets_only_tighten({ ratchets: [r(3, 3)] })).toEqual([]);
  });

  it('reports each ratchet independently', () => {
    expect(RULES.ratchets_only_tighten({ ratchets: [r(5, 3), r(3, 3), r(0, 2)] }))
      .toHaveLength(2);
  });
});

describe('parked_entries_still_apply', () => {
  const good = { key: ['Q1', 'rate'], keyRepr: "('Q1', 'rate')",
                 why: 'measured on 2026-09-01 and waiting on the Q44 rewrite' };

  it('FIRES when the lot outgrew its budget', () => {
    const f = RULES.parked_entries_still_apply({ entries: [good, good], budget: 1 });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('without raising the budget');
  });

  it('FIRES on a malformed key', () => {
    const f = RULES.parked_entries_still_apply({
      entries: [{ ...good, key: ['Q1'], keyRepr: "('Q1',)" }], budget: 9 });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('is not (item, kind)');
  });

  it('FIRES on a reason too short to say what would unpark it', () => {
    const f = RULES.parked_entries_still_apply({
      entries: [{ ...good, why: 'later' }], budget: 9 });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('never expires');
  });

  it('is silent on a well-formed entry inside budget', () => {
    expect(RULES.parked_entries_still_apply({ entries: [good], budget: 1 }))
      .toEqual([]);
  });
});

describe('maps_tables_are_attached', () => {
  // THE ARM THE PYTHON ORIGINAL COULD NOT REACH. It interpolated an unbound
  // `name` and raised NameError the moment either branch fired.
  it('FIRES on a table defined but never attached', () => {
    const f = RULES.maps_tables_are_attached({ entries: [
      { handout: 2, item: 'Q4b', inSpec: true, attached: false },
    ] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('rubric_h2');
    expect(f[0]).toContain('no route to its verdict');
  });

  it('FIRES on a table naming an item BY_ID does not have', () => {
    const f = RULES.maps_tables_are_attached({ entries: [
      { handout: 1, item: 'GONE', inSpec: false, attached: false },
    ] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('does not exist in BY_ID');
  });

  it('is silent on an attached table', () => {
    expect(RULES.maps_tables_are_attached({ entries: [
      { handout: 1, item: 'Q4a', inSpec: true, attached: true },
    ] })).toEqual([]);
  });
});
