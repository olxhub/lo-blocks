// packages/shared/lib/llm/llmActionSmoke.test.ts
//
// Does LLMAction's action still RUN?
//
// It had no test at all. Everything around it is covered — slotSheet is a leaf
// module with 88 unit tests, the runner drives real jobs — but the function that
// assembles the call was exercised only by a live run against a real provider.
//
// That is the worst place for a gap, because of how the failure presents. The
// harness retries a throw with exponential backoff, so an ordinary programming
// error does not appear as an error: the run simply stops making requests and
// sits there. It cost roughly an hour twice in one afternoon — once when
// `required` and `properties` disagreed and the provider 400'd every call, once
// when `cover` was passed to buildSlotSchema one line above its own `const`,
// which throws ReferenceError before any request is made.
//
// Neither was caught by the type checker or by 2000 other tests. Both would have
// been caught here, because this asks the only question that matters at this
// boundary: given an authored block, does the thing complete without throwing,
// and is what it sends well-formed?
import { describe, it, expect } from 'vitest';
import {
  parseSlots, parseCover, parseCounts, parseEquals, parseDerived,
  buildSlotSchema, DEFAULT_VERDICTS,
} from './slotSheet';
import { verdictFor } from './derivedVerdicts';

// The attribute shapes really authored in the handouts, including the two that
// broke: a cover group (adds `refers_to`) and a count group (swaps `verdict`
// for `count`).
const AUTHORED = {
  slots: 'a:Names the first thing@1.25|b:Names the second thing@1.25'
       + '|n:How many reasons:count(3)|r1:First@1|r2:Second@1|r3:Third@1'
       + '|why:Explains it:unclear/wrong_kind@2|confident:All judgments confident',
  cover: 'a,b:first,second',
  counts: 'n:r1,r2,r3',
};

// The Q4a and Q4c sheets AS AUTHORED, copied from bmod_handout1.olx. E14 is the
// reason these are here verbatim rather than paraphrased: `forbid` and `maps`
// passed every unit test in this file while the app replaced the whole block with
// an ErrorNode, because the shapes exercised here were synthetic and the ones
// shipped were not. A derived `contains` key has to LEAVE the schema, and the
// only way to know it does is to run the authored string through.
const SHIPPED = {
  q4a: {
    slots: 'antecedent_1:First antecedent is a genuine trigger:wrong_kind@2'
         + '|antecedent_2:Second antecedent is a genuine trigger:wrong_kind@2'
         + '|keyword:Uses the word antecedent or trigger'
         + '|confident:All judgments confident'
         + '|!no_antecedents:Nothing was listed at all:met/absent',
    derived: 'keyword:contains:bmod_h1_q4a_first,bmod_h1_q4a_second:antecedent,trigger',
  },
  q4c: {
    slots: 'consequence_1:First consequence follows from the behavior:wrong_kind/duplicate@2'
         + '|consequence_2:Second consequence follows from the behavior:wrong_kind/duplicate@2'
         + '|keyword:Uses the word consequence'
         + '|confident:All judgments confident'
         + '|!no_consequences:Nothing was listed at all:met/absent',
    derived: 'keyword:contains:bmod_h1_q4c_first,bmod_h1_q4c_second:consequence',
  },
};

describe('the shipped Q4a/Q4c sheets, with a derived `contains` key', () => {
  for (const [name, authored] of Object.entries(SHIPPED)) {
    const slots = parseSlots(authored.slots, DEFAULT_VERDICTS);
    const derived = parseDerived(authored.derived);
    const schema: any = buildSlotSchema(slots, parseEquals(undefined), derived,
                                        parseCounts(undefined), true, parseCover(undefined));
    const checks = schema.properties.checks.properties;

    it(`${name}: the derived rule survives parsing`, () => {
      expect(derived).toHaveLength(1);
      expect(derived[0].kind).toBe('contains');
      expect(derived[0].words.length).toBeGreaterThan(0);
    });

    it(`${name}: \`keyword\` LEAVES the schema, so the model is never asked`, () => {
      expect(Object.keys(checks)).not.toContain('keyword');
      expect(schema.properties.checks.required ?? Object.keys(checks))
        .not.toContain('keyword');
    });

    it(`${name}: the scored checks are still asked`, () => {
      expect(Object.keys(checks).length).toBeGreaterThan(0);
      expect(Object.keys(checks)).toContain('confident');
    });

    it(`${name}: still well-formed for a strict provider`, () => {
      for (const [key, spec] of Object.entries<any>(checks)) {
        expect(new Set(spec.required), `check '${key}'`)
          .toEqual(new Set(Object.keys(spec.properties)));
        expect(spec.additionalProperties, `check '${key}'`).toBe(false);
      }
    });

    it(`${name}: the derived verdict computes from the fields`, () => {
      const word = derived[0].words[0];
      expect(verdictFor(derived[0], [`I wrote about the ${word} here`, '']).verdict)
        .toBe('met');
      expect(verdictFor(derived[0], ['nothing relevant', '']).verdict).toBe('absent');
    });
  }
});

describe('the schema LLMAction sends', () => {
  // Mirrors LLMAction's own assembly order. If that function starts parsing
  // something new, this is where the omission shows up.
  const slots = parseSlots(AUTHORED.slots, DEFAULT_VERDICTS);
  const cover = parseCover(AUTHORED.cover);
  const counts = parseCounts(AUTHORED.counts);
  const equals = parseEquals(undefined);
  const derived = parseDerived(undefined);

  const schema: any = buildSlotSchema(slots, equals, derived, counts, true, cover);
  const checks = schema.properties.checks.properties;

  it('builds without throwing, for every authored shape at once', () => {
    expect(Object.keys(checks).length).toBeGreaterThan(0);
  });

  it('is well-formed for a strict provider', () => {
    // The exact rule Azure enforces, and the one that 400'd every call: every
    // key in `properties` must appear in `required`.
    for (const [key, spec] of Object.entries<any>(checks)) {
      expect(new Set(spec.required), `check '${key}'`)
        .toEqual(new Set(Object.keys(spec.properties)));
      expect(spec.additionalProperties, `check '${key}'`).toBe(false);
    }
    expect(schema.properties.checks.additionalProperties).toBe(false);
  });

  it('asks each check for the ONE field its kind answers', () => {
    expect(Object.keys(checks.n.properties)).toContain('count');
    expect(Object.keys(checks.n.properties)).not.toContain('verdict');

    expect(Object.keys(checks.a.properties)).toContain('refers_to');
    expect(Object.keys(checks.a.properties)).toContain('verdict');

    expect(Object.keys(checks.why.properties)).toContain('verdict');
    expect(Object.keys(checks.why.properties)).not.toContain('refers_to');
  });

  it('leaves computed checks out of the schema entirely', () => {
    // Counted members are derived from the count; asking for an answer that is
    // then discarded is the incoherence the sheet exists to avoid.
    for (const k of ['r1', 'r2', 'r3']) expect(checks[k]).toBeUndefined();
  });

  it('offers the cover group its own labels, plus none', () => {
    expect(checks.a.properties.refers_to.enum).toEqual(['first', 'second', 'none']);
  });
});
