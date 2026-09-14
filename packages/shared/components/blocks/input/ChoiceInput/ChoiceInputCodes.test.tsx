// @vitest-environment jsdom
// packages/shared/components/blocks/input/ChoiceInput/ChoiceInputCodes.test.tsx
//
// Option CODES: the number a selection is RECORDED as — the survey sense
// (SPSS code, Qualtrics recode value), never a score and never a grade.
//
// The properties under test are the ones a dataset depends on: an authored
// code comes back exactly as authored, a value the default table knows gets
// its conventional number when the author wrote none, explicit always beats
// the table, an unanswered item codes to nothing rather than to zero, and a
// code that is not a number fails the build instead of quietly becoming one.
//
// Reverse-coded items are here too: the reversal is declared once on the
// ITEM (`reverseCoded="true"`), which negates the default table for its
// options, and the typo guard measures every explicit code against THAT.
// The guard forgives nothing — a flipped sign is the typo it exists to find.
//
// Read end to end through `@id.code` — the way content reads it — because
// the selector is only useful if the expression language can see it.
//
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { mountOLXString } from '@/integration/demoRenderHarness';
import { parseOLX } from '@/lib/content/parseOLX';
import { toMemoryRef } from '@/lib/types/storage';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { TEST_NS, getOlxJson } from '@/lib/test-utils';
import {
  DEFAULT_CODES, defaultCodeForValue, normalizeCodeKey, resetCodeMismatchWarnings,
} from './defaultCodes';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
  resetCodeMismatchWarnings();
});

const parse = (olx: string, name: string) =>
  parseOLX(olx, [toMemoryRef(name)], undefined, TEST_NS);

/** An item plus a readout of its code and value, so one mount can assert
 *  both. `{{…}}` interpolation renders an undefined code as the empty
 *  string, which is how "no code" is asserted below. */
const item = (id: string, options: string, selector = 'code', attrs = '') =>
  `<Vertical id="wrap_${id}">
     <ChoiceInput id="${id}"${attrs}>${options}</ChoiceInput>
     <Markdown id="read_${id}">|{{@${id}.${selector}}}|</Markdown>
   </Vertical>`;

/** Click the nth option and let the write land. */
async function choose(container: HTMLElement, n: number) {
  const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  await act(async () => { (inputs[n] as HTMLInputElement).click(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

/** The text between the pipes the readout Markdown prints. */
const readout = (container: HTMLElement) =>
  container.textContent?.match(/\|([^|]*)\|/)?.[1] ?? null;

// ─── The table itself ────────────────────────────────────────────────────────

describe('the default-code table', () => {
  it('maps the conventional values to their conventional codes', () => {
    expect(DEFAULT_CODES).toMatchObject({
      true: 1, yes: 1, false: 0, no: 0, neutral: 0,
      agree: 1, disagree: -1,
      strongly_agree: 2, strongly_disagree: -2,
      somewhat_agree: 1, somewhat_disagree: -1,
    });
  });

  it('folds case, and treats spaces and underscores as the same character', () => {
    expect(normalizeCodeKey('Strongly Agree')).toBe('strongly_agree');
    expect(defaultCodeForValue('Strongly Agree')).toBe(2);
    expect(defaultCodeForValue('STRONGLY_DISAGREE')).toBe(-2);
    expect(defaultCodeForValue('  yes  ')).toBe(1);
  });

  it('negates for a reverse-coded item, and leaves zero alone', () => {
    expect(defaultCodeForValue('strongly_agree', true)).toBe(-2);
    expect(defaultCodeForValue('agree', true)).toBe(-1);
    expect(defaultCodeForValue('disagree', true)).toBe(1);
    expect(defaultCodeForValue('strongly_disagree', true)).toBe(2);
    // Zero is its own negation, and stays 0 rather than -0 so it prints as
    // "0" wherever it lands.
    expect(Object.is(defaultCodeForValue('neutral', true), 0)).toBe(true);
    expect(Object.is(defaultCodeForValue('false', true), 0)).toBe(true);
    // Plain arithmetic on the boolean family: true → -1, false → 0. Rarely
    // what anyone wants, which is why a reversed true/false item should
    // carry explicit codes.
    expect(defaultCodeForValue('true', true)).toBe(-1);
    expect(defaultCodeForValue('yes', true)).toBe(-1);
    // A value the table does not know is still unknown, reversed or not.
    expect(defaultCodeForValue('mercury', true)).toBeUndefined();
  });

  it('says nothing about values it does not know', () => {
    // The Polish-label case: the table keys VALUES, not display text.
    expect(defaultCodeForValue('zgadzam_się')).toBeUndefined();
    expect(defaultCodeForValue('mercury')).toBeUndefined();
    expect(defaultCodeForValue('strongly-agree')).toBeUndefined();  // hyphens not folded
    expect(defaultCodeForValue(undefined)).toBeUndefined();
  });
});

// ─── Reading a code back ─────────────────────────────────────────────────────

describe('@id.code', () => {
  it('reads the selected option\'s explicit code', async () => {
    const { container } = await mountOLXString(item('c_explicit', `
      <Key value="agree" code="-1">Zgadzam się</Key>
      <Distractor value="disagree" code="1">Nie zgadzam się</Distractor>`,
      'code', ' reverseCoded="true"'), 'code-explicit');

    await choose(container, 0);
    expect(readout(container)).toBe('-1');
    await choose(container, 1);
    expect(readout(container)).toBe('1');
  });

  it('falls back to the default code when the option has none', async () => {
    const { container } = await mountOLXString(item('c_default', `
      <Key value="strongly_agree">Strongly agree</Key>
      <Distractor value="strongly_disagree">Strongly disagree</Distractor>`), 'code-default');

    await choose(container, 0);
    expect(readout(container)).toBe('2');
    await choose(container, 1);
    expect(readout(container)).toBe('-2');
  });

  it('lets an explicit code beat the default for the same value', async () => {
    // The value stays "agree" — the learner agreed — but on THIS item
    // agreeing is the negative pole, so it is recorded as -1. Marked
    // reverseCoded because it is, which is also what keeps the guard quiet.
    const { container } = await mountOLXString(item('c_reversed', `
      <Key value="agree" code="-1">Agree</Key>
      <Distractor value="disagree" code="1">Disagree</Distractor>`,
      'code', ' reverseCoded="true"'), 'code-reversed');

    await choose(container, 0);
    expect(readout(container)).toBe('-1');   // not the table's 1
  });

  it('is undefined with nothing selected', async () => {
    const { container } = await mountOLXString(item('c_unset', `
      <Key value="agree" code="1">Agree</Key>
      <Distractor value="disagree" code="-1">Disagree</Distractor>`), 'code-unset');

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(readout(container)).toBe('');      // not "0"
  });

  it('is undefined when the selected option has no code and no default', async () => {
    const { container } = await mountOLXString(item('c_uncoded', `
      <Key value="mercury">Mercury</Key>
      <Distractor value="venus">Venus</Distractor>`), 'code-uncoded');

    await choose(container, 0);
    expect(readout(container)).toBe('');
  });

  it('negates the default table on a reverseCoded item, with no per-option codes', async () => {
    // A reversed item in its shortest honest form: the reversal is stated
    // once on the item, and every option's number follows from it.
    const { container } = await mountOLXString(item('c_rc', `
      <Key value="strongly_agree">Strongly agree</Key>
      <Key value="agree">Agree</Key>
      <Key value="neutral">Neutral</Key>
      <Key value="disagree">Disagree</Key>
      <Key value="strongly_disagree">Strongly disagree</Key>`,
      'code', ' reverseCoded="true"'), 'code-reversecoded');

    await choose(container, 0);
    expect(readout(container)).toBe('-2');   // not the table's 2
    await choose(container, 1);
    expect(readout(container)).toBe('-1');
    await choose(container, 2);
    expect(readout(container)).toBe('0');    // not "-0"
    await choose(container, 3);
    expect(readout(container)).toBe('1');
    await choose(container, 4);
    expect(readout(container)).toBe('2');
  });

  it('lets an explicit code beat the negated default too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});  // -7 is a real mismatch
    const { container } = await mountOLXString(item('c_rc_explicit', `
      <Key value="agree" code="-7">Agree</Key>
      <Key value="disagree">Disagree</Key>`,
      'code', ' reverseCoded="true"'), 'code-reversecoded-explicit');

    await choose(container, 0);
    expect(readout(container)).toBe('-7');
    await choose(container, 1);
    expect(readout(container)).toBe('1');
    warn.mockRestore();
  });

  it('codes a Distractor as readily as a Key — a code is not a grade', async () => {
    const { container } = await mountOLXString(item('c_distractor', `
      <Key value="yes">Yes</Key>
      <Distractor value="no" code="0">No</Distractor>`), 'code-distractor');

    await choose(container, 1);
    expect(readout(container)).toBe('0');
  });
});

describe('@id.codes (CheckboxInput)', () => {
  const boxes = (id: string, options: string) =>
    `<Vertical id="wrap_${id}">
       <CheckboxInput id="${id}">${options}</CheckboxInput>
       <Markdown id="read_${id}">|{{@${id}.codes}}|</Markdown>
     </Vertical>`;

  it('is empty with nothing checked, and lists codes in checked order', async () => {
    const { container } = await mountOLXString(boxes('cb_order', `
      <Key value="agree" code="1">Agree</Key>
      <Key value="neutral">Neutral</Key>
      <Distractor value="disagree" code="-1">Disagree</Distractor>`), 'codes-order');

    expect(readout(container)).toBe('[]');

    await choose(container, 2);               // disagree first
    expect(readout(container)).toBe('[-1]');
    await choose(container, 0);               // then agree
    expect(readout(container)).toBe('[-1,1]');
    await choose(container, 1);               // then the defaulted neutral → 0
    expect(readout(container)).toBe('[-1,1,0]');
  });

  it('negates the default table on a reverseCoded CheckboxInput', async () => {
    const { container } = await mountOLXString(
      `<Vertical id="wrap_cb_rc">
         <CheckboxInput id="cb_rc" reverseCoded="true">
           <Key value="strongly_agree">Strongly agree</Key>
           <Key value="neutral">Neutral</Key>
           <Key value="disagree">Disagree</Key>
         </CheckboxInput>
         <Markdown id="read_cb_rc">|{{@cb_rc.codes}}|</Markdown>
       </Vertical>`, 'codes-reversecoded');

    await choose(container, 0);
    expect(readout(container)).toBe('[-2]');   // not the table's 2
    await choose(container, 1);
    expect(readout(container)).toBe('[-2,0]');
    await choose(container, 2);
    expect(readout(container)).toBe('[-2,0,1]');
  });

  it('omits checked options that have no code at all', async () => {
    const { container } = await mountOLXString(boxes('cb_uncoded', `
      <Key value="mercury">Mercury</Key>
      <Key value="yes">Yes</Key>`), 'codes-uncoded');

    await choose(container, 0);
    expect(readout(container)).toBe('[]');
    await choose(container, 1);
    expect(readout(container)).toBe('[1]');
  });
});

// ─── Parse time ──────────────────────────────────────────────────────────────

describe('code= at parse time', () => {
  it('rejects a code that is not a number', async () => {
    const { errors } = await parse(
      '<ChoiceInput id="c_bad"><Key value="agree" code="one">Agree</Key></ChoiceInput>',
      'code-nan');

    expect(errors.map(e => e.message).join('\n')).toMatch(/code must be a finite number/);
  });

  it('rejects an empty code rather than reading it as zero', async () => {
    const { errors } = await parse(
      '<ChoiceInput id="c_empty"><Key value="agree" code="">Agree</Key></ChoiceInput>',
      'code-empty');

    expect(errors.map(e => e.message).join('\n')).toMatch(/code must be a finite number/);
  });

  it('rejects an infinite code', async () => {
    const { errors } = await parse(
      '<ChoiceInput id="c_inf"><Key value="agree" code="1e999">Agree</Key></ChoiceInput>',
      'code-inf');

    expect(errors.map(e => e.message).join('\n')).toMatch(/code must be a finite number/);
  });

  it('accepts negative and fractional codes, and stores them as numbers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});  // both disagree; not the point here
    const { idMap, errors } = await parse(
      `<ChoiceInput id="c_ok">
         <Key id="c_ok_a" value="agree" code="-1">Agree</Key>
         <Distractor id="c_ok_b" value="disagree" code="1.5">Disagree</Distractor>
       </ChoiceInput>`, 'code-ok');

    expect(errors).toEqual([]);
    expect(getOlxJson(idMap, 'c_ok_a')?.attributes.code).toBe(-1);
    expect(getOlxJson(idMap, 'c_ok_b')?.attributes.code).toBe(1.5);
    warn.mockRestore();
  });
});

describe('the typo guard', () => {
  it('warns when an explicit code disagrees with the default for its value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse('<ChoiceInput id="t_typo"><Key id="t_typo_a" value="true" code="11">True</Key></ChoiceInput>',
      'typo-warn');

    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(
      /<Key value="true" code="11">: code 11 differs from the default code 1 for "true"; explicit code is used — check for a typo\./);
    warn.mockRestore();
  });

  it('is a warning only — the explicit code still parses and still wins', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { idMap, errors } = await parse(
      '<ChoiceInput id="t_wins"><Key id="t_wins_a" value="true" code="11">True</Key></ChoiceInput>',
      'typo-wins');

    expect(errors).toEqual([]);
    expect(getOlxJson(idMap, 't_wins_a')?.attributes.code).toBe(11);
    warn.mockRestore();
  });

  it('stays quiet when the code agrees with the default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse('<ChoiceInput id="t_agree"><Key id="t_agree_a" value="agree" code="1">Agree</Key></ChoiceInput>',
      'typo-agree');

    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).not.toMatch(/check for a typo/);
    warn.mockRestore();
  });

  it('stays quiet when the value is not in the table', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse('<ChoiceInput id="t_unknown"><Key id="t_unknown_a" value="mercury" code="7">Mercury</Key></ChoiceInput>',
      'typo-unknown');

    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).not.toMatch(/check for a typo/);
    warn.mockRestore();
  });

  it('warns on a flipped sign — the easiest typo there is, not an exemption', async () => {
    // A reversed item says so on the item (reverseCoded, below). A code
    // whose sign disagrees with the default is otherwise indistinguishable
    // from a dropped minus, which is the mistake this guard is best placed
    // to catch, so it warns like any other disagreement.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse(`<ChoiceInput id="t_rev">
        <Key id="t_rev_a" value="strongly_agree" code="-2">Strongly agree</Key>
        <Key id="t_rev_b" value="agree" code="-1">Agree</Key>
        <Key id="t_rev_c" value="disagree" code="1">Disagree</Key>
        <Key id="t_rev_d" value="strongly_disagree" code="2">Strongly disagree</Key>
      </ChoiceInput>`, 'typo-reversed');

    const warnings = warn.mock.calls.map(c => String(c[0]));
    expect(warnings.filter(w => /check for a typo/.test(w))).toHaveLength(4);
    expect(warnings.join('\n')).toMatch(
      /code -2 differs from the default code 2 for "strongly_agree"/);
    warn.mockRestore();
  });

  it('measures against the NEGATED default on a reverseCoded item', async () => {
    // The same four codes as above, now declared as what they are. Nothing
    // to warn about: each code is the effective default for its value.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse(`<ChoiceInput id="t_rc" reverseCoded="true">
        <Key id="t_rc_a" value="strongly_agree" code="-2">Strongly agree</Key>
        <Key id="t_rc_b" value="agree" code="-1">Agree</Key>
        <Key id="t_rc_c" value="disagree" code="1">Disagree</Key>
        <Key id="t_rc_d" value="strongly_disagree" code="2">Strongly disagree</Key>
      </ChoiceInput>`, 'typo-reversecoded');

    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).not.toMatch(/check for a typo/);
    warn.mockRestore();
  });

  it('warns on an UN-reversed code inside a reverseCoded item', async () => {
    // One option left at the table's sign while the item is reversed — the
    // half-finished reversal the old exemption could not see.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse(`<ChoiceInput id="t_rc_slip" reverseCoded="true">
        <Key id="t_rc_slip_a" value="strongly_agree" code="-2">Strongly agree</Key>
        <Key id="t_rc_slip_b" value="agree" code="1">Agree</Key>
      </ChoiceInput>`, 'typo-reversecoded-slip');

    const warnings = warn.mock.calls.map(c => String(c[0]));
    expect(warnings.filter(w => /check for a typo/.test(w))).toHaveLength(1);
    expect(warnings.join('\n')).toMatch(
      /code 1 differs from the default code -1 for "agree" on a reverseCoded item/);
    warn.mockRestore();
  });

  it('still warns on a near miss that is not a negation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse('<ChoiceInput id="t_near"><Key id="t_near_a" value="strongly_agree" code="3">Strongly agree</Key></ChoiceInput>',
      'typo-near');

    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(
      /code 3 differs from the default code 2 for "strongly_agree"/);
    warn.mockRestore();
  });

  it('still warns on a nonzero code against a zero default', async () => {
    // -0 === 0, so `false`/`no`/`neutral` coded 0 matched outright and never
    // reached the negation test; anything else there is still suspect.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse('<ChoiceInput id="t_zero"><Key id="t_zero_a" value="neutral" code="1">Neutral</Key></ChoiceInput>',
      'typo-zero');

    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(
      /code 1 differs from the default code 0 for "neutral"/);
    warn.mockRestore();
  });
});

// ─── What is NOT inferred today ──────────────────────────────────────────────
//
// Pinned so the breadcrumb in INFERENCE.md stays honest: the code half of
// `<Key> True </Key>` works, the value half does not.
describe('what a bare <Key> infers today', () => {
  it('does not derive a value from the option\'s text', async () => {
    const { idMap, errors } = await parse(
      '<ChoiceInput id="bare"><Key> True </Key></ChoiceInput>', 'bare-key');

    expect(errors).toEqual([]);
    const optionKey = Object.keys(idMap)
      .find(k => idMap[k][Object.keys(idMap[k])[0]].tag === 'Key')!;
    // No id= and no value=: the attributes are empty, and the id is a
    // content hash. getChoices therefore reports the definition key as the
    // value, which the default-code table cannot possibly know.
    const option = idMap[optionKey][Object.keys(idMap[optionKey])[0]];
    expect(option.tag).toBe('Key');
    expect(option.attributes.value).toBeUndefined();
    expect(option.attributes.code).toBeUndefined();
    expect(optionKey).toMatch(/\/_[0-9a-f]{40}$/);
    expect(defaultCodeForValue(optionKey)).toBeUndefined();
  });

  it('does reach the table once the value is written out', async () => {
    const { container } = await mountOLXString(item('bare_valued', `
      <Key value="true">True</Key><Distractor value="false">False</Distractor>`), 'bare-valued');

    await choose(container, 0);
    expect(readout(container)).toBe('1');
    await choose(container, 1);
    expect(readout(container)).toBe('0');
  });
});
