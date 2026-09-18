// Checks read off the page rather than asked of the model.
//
// Handout 3's 1c asks whether the student produced a graph of their own data. On
// paper that was a judgement about a .docx — an embedded chart, an image, or prose
// describing a graph that isn't there. On the web the chart is DRAWN from four
// data fields, so the runtime already knows: blank or non-numeric fields render
// nothing, and the worked example's own numbers render the worked example.
//
// The parsing lives in the block (it reuses the chart's own `parseSeries`, so the
// grader cannot disagree with what the student sees). What lives here is the
// declaration — which key is derived, from what, and against what template — and
// the fact that a derived key is left OUT of the response schema.

import { describe, it, expect } from 'vitest';
import { parseDerived, parseSlots, buildSlotSchema, parseCounts,
         satisfiedMap, scoreSlotSheet, composeSlotFeedback } from './slotSheet';
import { verdictFor } from './derivedVerdicts';
import { DEFAULT_VERDICTS, EXTRA_VERDICTS, parseSlots, satisfiedMap } from './slotSheet';
import { verdictFor } from './derivedVerdicts';

const SHEET =
  '!has_own_graph:Your 1b data produces a graph of your own:met/absent/mismatch@2|' +
  'title:Title saying what is measured:met/absent/generic@2|' +
  'legend:Legend naming all four series:met/absent/incomplete@2';
const slots = parseSlots(SHEET);

describe('parseDerived', () => {
  it('reads a rule with no template', () => {
    expect(parseDerived('has_own_graph:plots:a,b,c')).toEqual([
      { key: 'has_own_graph', kind: 'plots', targets: ['a', 'b', 'c'], template: [],
        words: [] },
    ]);
  });

  it('reads template series, semicolon-separated', () => {
    expect(parseDerived('k:plots:a,b:1,2,3;4,5,6')).toEqual([
      { key: 'k', kind: 'plots', targets: ['a', 'b'], template: [[1, 2, 3], [4, 5, 6]],
        words: [] },
    ]);
  });

  it('reads the `present` kind', () => {
    expect(parseDerived('type_stated:present:choice')).toEqual([
      { key: 'type_stated', kind: 'present', targets: ['choice'], template: [],
        words: [] },
    ]);
  });

  it('reads the `contains` kind, case-folding its words', () => {
    expect(parseDerived('keyword:contains:a,b:Antecedent,TRIGGER')).toEqual([
      { key: 'keyword', kind: 'contains', targets: ['a', 'b'], template: [],
        words: ['antecedent', 'trigger'] },
    ]);
  });

  it('gives `words` only to `contains`, so a template cannot leak into it', () => {
    // A plots template splits on commas into a token `3;4`, which is not a
    // number. Read as words it would survive a numeric filter and sit in the
    // structure unused -- harmless until something consulted it.
    expect(parseDerived('k:plots:a,b:1,2,3;4,5,6')[0].words).toEqual([]);
  });

  it('DROPS a `contains` rule with no words, which would fail every student', () => {
    // It would match nothing and score everyone `absent`. Dropped like an
    // unknown kind, so DerivedChecks reports a scored check with no rule.
    expect(parseDerived('keyword:contains:a')).toEqual([]);
  });

  it('reads several rules of mixed kinds', () => {
    expect(parseDerived('k:plots:a|j:present:b').map(r => r.kind))
      .toEqual(['plots', 'present']);
  });

  it('is empty for absent or malformed input', () => {
    expect(parseDerived(undefined)).toEqual([]);
    expect(parseDerived('')).toEqual([]);
    expect(parseDerived('notargets')).toEqual([]);
    expect(parseDerived(':plots:a,b')).toEqual([]);
    expect(parseDerived('k:plots')).toEqual([]);
  });

  it('DROPS a rule naming an unknown kind, rather than guessing one', () => {
    // A guessed kind would misgrade; a dropped rule leaves the scored check
    // without one, which DerivedChecks reports as an author error.
    expect(parseDerived('k:vibes:a')).toEqual([]);
    expect(parseDerived('k:a,b')).toEqual([]);          // kind omitted entirely
  });

  it('drops non-numeric template entries rather than making them NaN', () => {
    // NaN !== NaN, so a stray token would make the template never match and the
    // template case would silently stop being enforced.
    expect(parseDerived('k:plots:a:1,oops,3')[0].template).toEqual([[1, 3]]);
  });
});

describe('verdictFor dispatches on kind', () => {
  const rule = (kind: string) => parseDerived(`k:${kind}:a`)[0];

  it('`present` is met by any value and absent by none', () => {
    expect(verdictFor(rule('present'), ['Positive Reinforcement']).verdict).toBe('met');
    expect(verdictFor(rule('present'), ['']).verdict).toBe('absent');
    expect(verdictFor(rule('present'), ['   ']).verdict).toBe('absent');
  });

  it('`present` does not care whether the value is a number', () => {
    // The point of the second kind: a closed choice has nothing to parse.
    expect(verdictFor(rule('present'), ['Negative Punishment']).verdict).toBe('met');
    expect(verdictFor(rule('plots'), ['Negative Punishment']).verdict).toBe('absent');
  });

  it('`present` needs every target answered', () => {
    const two = parseDerived('k:present:a,b')[0];
    expect(verdictFor(two, ['x', 'y']).verdict).toBe('met');
    expect(verdictFor(two, ['x', '']).verdict).toBe('absent');
  });

  it('`contains` searches the WHOLE response, not each field', () => {
    // The rubric asks whether the word appears anywhere, so a student who uses
    // it in the first box and not the second has still used it.
    const two = parseDerived('k:contains:a,b:antecedent')[0];
    expect(verdictFor(two, ['my antecedent is noise', '']).verdict).toBe('met');
    expect(verdictFor(two, ['', 'the antecedent again']).verdict).toBe('met');
    expect(verdictFor(two, ['bored', 'tired']).verdict).toBe('absent');
  });

  it('`contains` is case-folded and matches inflections', () => {
    const r = parseDerived('k:contains:a:antecedent,trigger')[0];
    expect(verdictFor(r, ['The TRIGGER was hunger']).verdict).toBe('met');
    expect(verdictFor(r, ['two antecedents']).verdict).toBe('met');
  });

  it('`contains` accepts all four kinds of mistyping as ONE edit', () => {
    const r = parseDerived('k:contains:a:antecedent')[0];
    expect(verdictFor(r, ['my antecdent']).verdict).toBe('met');      // deletion
    expect(verdictFor(r, ['my antecedennt']).verdict).toBe('met');    // insertion
    expect(verdictFor(r, ['my antecedant']).verdict).toBe('met');     // substitution
    expect(verdictFor(r, ['my antecedetn']).verdict).toBe('met');     // TRANSPOSITION
  });

  it('a short target keeps a budget of 1, so a real word cannot satisfy it', () => {
    // `bigger` is two edits from `trigger`. A budget that admitted it would be
    // crediting a student for a word they did not reach for.
    const r = parseDerived('k:contains:a:trigger')[0];
    expect(verdictFor(r, ['a bigger problem']).verdict).toBe('absent');
    expect(verdictFor(r, ['my trigegr']).verdict).toBe('met');        // swap, 1 edit
  });

  it('`contains` says what they typed when it accepted a misspelling', () => {
    const r = parseDerived('k:contains:a:consequence')[0];
    const v = verdictFor(r, ['the conequence of that']);
    expect(v.verdict).toBe('met');
    expect(v.evidence).toContain('conequence');
  });

  it('`contains` names the word it found in its evidence', () => {
    const r = parseDerived('k:contains:a:antecedent,trigger')[0];
    expect(verdictFor(r, ['my trigger']).evidence).toContain('trigger');
    expect(verdictFor(r, ['nothing']).evidence).toContain('antecedent');
  });

  it('`plots` goes through the chart parser', () => {
    expect(verdictFor(rule('plots'), ['1, 2, 3']).verdict).toBe('met');
    expect(verdictFor(rule('plots'), ['']).verdict).toBe('absent');
  });

  it('throws on a kind parseDerived would never produce', () => {
    expect(() => verdictFor({ key: 'k', kind: 'vibes', targets: ['a'], template: [] },
      ['x'])).toThrow(/unhandled kind/);
  });
});

describe('a derived check is not asked for', () => {
  it('is absent from the schema properties and required list', () => {
    const schema: any = buildSlotSchema(slots, [], parseDerived('has_own_graph:plots:a,b'));
    const props = schema.properties.checks.properties;
    expect(Object.keys(props)).not.toContain('has_own_graph');
    expect(schema.properties.checks.required).not.toContain('has_own_graph');
    // ...and the checks that ARE judgements stay.
    expect(Object.keys(props)).toContain('title');
    expect(Object.keys(props)).toContain('legend');
  });

  it('is still asked for when no rule names it', () => {
    const schema: any = buildSlotSchema(slots, [], []);
    expect(Object.keys(schema.properties.checks.properties)).toContain('has_own_graph');
  });

  it('composes with `equals`, which excludes its own keys too', () => {
    const s = parseSlots('a:A:x/y@1|b:B:x/y@1|c:C:x/y@1|d:D:x/y@1');
    const schema: any = buildSlotSchema(
      s,
      [{ key: 'c', left: 'a', right: 'b', lenient: [] }],
      parseDerived('d:present:field'),
    );
    expect(Object.keys(schema.properties.checks.properties)).toEqual(['a', 'b']);
  });
});

describe('counts — a repeated element counted once', () => {
  // `count(3)`, as every shipped count group is authored. This said `3/2/1/0` --
  // an ENUMERATED count, where the number arrives as a verdict because the slot
  // has an option list. No content has been authored that way since the counts
  // migration, and that shape was the only thing `countedVerdicts`' legacy
  // `verdict` fallback ever served. Testing it kept the fallback alive in the
  // suite after production had stopped needing it.
  const sheet = parseSlots(
    'utb_stated:UTB stated:met/absent@2|reasons_given:How many reasons:count(3)|' +
    'reason_1:First reason:met/absent@1|reason_2:Second:met/absent@1|' +
    'reason_3:Third:met/absent@1');
  const counts = parseCounts('reasons_given:reason_1,reason_2,reason_3');
  // A COUNT ARRIVES IN `count`. This read `verdict: n`, which worked only while
  // `countedVerdicts` still fell back to the verdict field for content that had
  // not migrated. That fallback is gone (both engines lost it together), so a
  // count in `verdict` now reads as no count at all -- asserted directly in the
  // last case here.
  const sheetOf = (n: string) => ({
    utb_stated: { verdict: 'met' }, reasons_given: { count: n },
  });

  it('reads groups', () => {
    expect(parseCounts('k:a,b,c')).toEqual([{ key: 'k', slots: ['a', 'b', 'c'] }]);
    expect(parseCounts(undefined)).toEqual([]);
    expect(parseCounts('nomembers')).toEqual([]);
  });

  it('awards the first N members', () => {
    expect(satisfiedMap(sheet, sheetOf('2'), [], [], counts))
      .toMatchObject({ reason_1: true, reason_2: true, reason_3: false });
  });

  it('does NOT award members from a count left in `verdict`', () => {
    // The removed fallback, pinned as a negative. Reintroducing it would split
    // the engines: the harness mirror (`agreement.expand_counted`) reads `count`
    // only, so a sheet that still honoured `verdict` would score the same
    // recorded cell differently on the two sides.
    expect(satisfiedMap(sheet, { utb_stated: { verdict: 'met' },
                                 reasons_given: { verdict: '2' } }, [], [], counts))
      .toMatchObject({ reason_1: false, reason_2: false, reason_3: false });
  });

  it('scores the count, not the members', () => {
    expect(scoreSlotSheet(sheet, sheetOf('3'), 5, [], [], [], counts)?.score).toBe(5);
    expect(scoreSlotSheet(sheet, sheetOf('2'), 5, [], [], [], counts)?.score).toBe(4);
    expect(scoreSlotSheet(sheet, sheetOf('0'), 5, [], [], [], counts)?.score).toBe(2);
  });

  it('treats an unreadable count as zero rather than as full marks', () => {
    expect(scoreSlotSheet(sheet, sheetOf('lots'), 5, [], [], [], counts)?.score).toBe(2);
  });

  // The displayed sheet and the scored sheet must be the same sheet. Counted
  // members are left out of the response schema, so the model never answers
  // them; a renderer that reads their verdicts raw shows "not reported" on the
  // very members the score just awarded. That shipped: Handout 1 Q1 credited
  // three reasons and listed all three as missing.
  it('renders counted members from the count, not as "not reported"', () => {
    const out = composeSlotFeedback(sheet, { checks: sheetOf('2') }, { counts });
    expect(out).not.toMatch(/not reported/);
    expect(out).toMatch(/✓ \*\*First reason\*\*/);
    expect(out).toMatch(/✓ \*\*Second\*\*/);
    expect(out).toMatch(/· \*\*Third\*\*/);
  });

  it('agrees with the score about which members were awarded', () => {
    for (const n of ['0', '1', '2', '3']) {
      const awarded = (composeSlotFeedback(sheet, { checks: sheetOf(n) }, { counts })
        .match(/✓ \*\*(First reason|Second|Third)\*\*/g) ?? []).length;
      expect(awarded).toBe(Number(n));
    }
  });

  it('overrides whatever the model sent for a member', () => {
    const lying = { ...sheetOf('1'), reason_3: { verdict: 'met' } };
    expect(satisfiedMap(sheet, lying, [], [], counts).reason_3).toBe(false);
  });

  it('leaves the members out of the schema but keeps the count in', () => {
    const props: any = buildSlotSchema(sheet, [], [], counts).properties;
    const keys = Object.keys(props.checks.properties);
    expect(keys).toContain('reasons_given');
    expect(keys).not.toContain('reason_1');
    expect(props.checks.required).not.toContain('reason_3');
  });
});

// ---------------------------------------------------------------------------
// Derived verdicts have to speak the canonical vocabulary.
//
// These are decided by code, not by a model, so nothing validates them against
// the slot's schema on the way through. Before the standardisation they were
// bare literals that happened to match because every consuming slot listed
// `met` first — a coincidence between two files that would have failed by
// silently scoring every derived check absent, with no error anywhere.
// ---------------------------------------------------------------------------
describe('derived verdicts speak the canonical vocabulary', () => {
  const CANONICAL = new Set([...DEFAULT_VERDICTS, ...EXTRA_VERDICTS]);

  const emitted = [
    verdictFor({ key: 'k', kind: 'present', template: [] } as any, ['x']),
    verdictFor({ key: 'k', kind: 'present', template: [] } as any, ['']),
    verdictFor({ key: 'k', kind: 'plots', template: [] } as any, ['1, 2, 3']),
    verdictFor({ key: 'k', kind: 'plots', template: [] } as any, ['nothing numeric']),
    verdictFor({ key: 'k', kind: 'plots', template: [[1, 2, 3]] } as any, ['1, 2, 3']),
  ];

  it('never invents a token outside the vocabulary', () => {
    for (const v of emitted) {
      expect(CANONICAL, `emitted "${v.verdict}"`).toContain(v.verdict);
    }
  });

  it('produces a verdict a canonical slot actually counts as satisfied', () => {
    // The end-to-end property: a derived `met` must survive isSatisfied on a
    // slot authored the ordinary way. This is what the old literal risked.
    const [slot] = parseSlots('k:Answered@1');
    const met = verdictFor({ key: 'k', kind: 'present', template: [] } as any, ['x']);
    expect(satisfiedMap([slot], { k: { verdict: met.verdict } }).k).toBe(true);

    const absent = verdictFor({ key: 'k', kind: 'present', template: [] } as any, ['']);
    expect(satisfiedMap([slot], { k: { verdict: absent.verdict } }).k).toBe(false);
  });

  it('always says why, since the student reads it', () => {
    for (const v of emitted) expect(v.evidence.trim()).not.toBe('');
  });
});
