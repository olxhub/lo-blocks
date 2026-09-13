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
const item = (id: string, options: string, selector = 'code') =>
  `<Vertical id="wrap_${id}">
     <ChoiceInput id="${id}">${options}</ChoiceInput>
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
      <Distractor value="disagree" code="1">Nie zgadzam się</Distractor>`), 'code-explicit');

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

  it('lets an explicit code beat the default for the same value (reversed items)', async () => {
    // The reversal that makes this feature worth having: the value stays
    // "agree" — the learner agreed — but on THIS item agreeing is the
    // negative pole, so it is recorded as -1.
    const { container } = await mountOLXString(item('c_reversed', `
      <Key value="agree" code="-1">Agree</Key>
      <Distractor value="disagree" code="1">Disagree</Distractor>`), 'code-reversed');

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
    const { idMap, errors } = await parse(
      `<ChoiceInput id="c_ok">
         <Key id="c_ok_a" value="agree" code="-1">Agree</Key>
         <Distractor id="c_ok_b" value="disagree" code="1.5">Disagree</Distractor>
       </ChoiceInput>`, 'code-ok');

    expect(errors).toEqual([]);
    expect(getOlxJson(idMap, 'c_ok_a')?.attributes.code).toBe(-1);
    expect(getOlxJson(idMap, 'c_ok_b')?.attributes.code).toBe(1.5);
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

  it('stays quiet for an exact negation — a reversed item, not a typo', async () => {
    // The one disagreement that is never a mistake, and the commonest reason
    // to write a code at all. Warning here would bury the real typos under
    // every properly reversed instrument.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parse(`<ChoiceInput id="t_rev">
        <Key id="t_rev_a" value="strongly_agree" code="-2">Strongly agree</Key>
        <Key id="t_rev_b" value="agree" code="-1">Agree</Key>
        <Key id="t_rev_c" value="disagree" code="1">Disagree</Key>
        <Key id="t_rev_d" value="strongly_disagree" code="2">Strongly disagree</Key>
      </ChoiceInput>`, 'typo-reversed');

    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).not.toMatch(/check for a typo/);
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
