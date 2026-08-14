// Tests for slot sheets: the helpers themselves, plus the slot sheets actually
// authored in course content.
//
// The content half matters because a slot sheet is a string in an XML
// attribute. A stray colon or a duplicated key produces a schema that is still
// valid JSON but asks the model for the wrong thing, and nothing else in the
// build would notice.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import {
  parseSlots,
  buildSlotSchema,
  composeSlotFeedback,
  failedGate,
  scoreSlotSheet,
  publishedSheet,
  checklistGuidance,
  slotSheetGuidance,
  DEFAULT_VERDICTS,
  displayVerdict,
  parseEquals,
  parseExpect,
  parseChoices,
  resolveOptions,
  isSatisfied,
  parseCounts,
  parseCover,
  satisfiedMap,
  type SlotSpec,
} from './slotSheet';

describe('parseSlots', () => {
  it('reads key:Label entries and applies the default verdicts', () => {
    const slots = parseSlots('a:First thing|b:Second thing');
    expect(slots).toEqual([
      { key: 'a', label: 'First thing', options: DEFAULT_VERDICTS, gates: false },
      { key: 'b', label: 'Second thing', options: DEFAULT_VERDICTS, gates: false },
    ]);
  });

  it('lets one slot override the verdict set', () => {
    const [slot] = parseSlots('kind:Which type it is:PR/NR/PP/NP/none');
    expect(slot.options).toEqual(['PR', 'NR', 'PP', 'NP', 'none']);
  });

  it('falls back to the key when no label is given', () => {
    expect(parseSlots('bare')[0].label).toBe('bare');
  });

  it('keeps commas inside labels (the verdict list is a separate attribute)', () => {
    expect(parseSlots('a:Named, and matching 4a')[0].label).toBe('Named, and matching 4a');
  });

  it('ignores empty entries and whitespace', () => {
    expect(parseSlots('  a:One  ||  b:Two  ')).toHaveLength(2);
  });

  it('returns nothing for empty or unusable input', () => {
    expect(parseSlots('')).toEqual([]);
    expect(parseSlots('|||')).toEqual([]);
  });

  it('reads a leading ! as a gating slot and strips it from the key', () => {
    const [gate, plain] = parseSlots('!counterpart:About the same behavior|a:One');
    expect(gate).toMatchObject({ key: 'counterpart', gates: true });
    expect(plain).toMatchObject({ key: 'a', gates: false });
  });
});

describe('parseSlots: point values', () => {
  it('reads a trailing @n off any entry shape', () => {
    const slots = parseSlots('a:One@2|b:Two:met/absent@1.25|!g:Gate@3|plain:No points');
    expect(slots.map(s => s.pts)).toEqual([2, 1.25, 3, undefined]);
    expect(slots[1].options).toEqual(['met', 'absent']);
    expect(slots[2].gates).toBe(true);
    expect(slots[2].key).toBe('g');
  });

  it('leaves the label intact when points are attached', () => {
    expect(parseSlots('a:Named, and matching 4a@2')[0].label).toBe('Named, and matching 4a');
  });
});

describe('scoreSlotSheet', () => {
  const sheet = parseSlots('a:One@2|b:Two@1|c:Three@1');

  it('is null for a sheet with no points, rather than inventing a total', () => {
    expect(scoreSlotSheet(parseSlots('a:One|b:Two'), {})).toBeNull();
  });

  it('gives the total when every check is satisfied', () => {
    const r = scoreSlotSheet(sheet, {
      a: { verdict: 'met' }, b: { verdict: 'met' }, c: { verdict: 'met' },
    });
    expect(r).toEqual({ score: 4, max: 4, failed: [] });
  });

  it('takes off exactly what each unsatisfied check is worth', () => {
    const r = scoreSlotSheet(sheet, {
      a: { verdict: 'absent' }, b: { verdict: 'met' }, c: { verdict: 'unclear' },
    });
    expect(r).toEqual({ score: 1, max: 4, failed: ['a', 'c'] });
  });

  it('treats a missing verdict as unsatisfied', () => {
    expect(scoreSlotSheet(sheet, {})).toEqual({ score: 0, max: 4, failed: ['a', 'b', 'c'] });
  });

  it('zeroes the item on a failed gate, whatever else was met', () => {
    const gated = parseSlots('!g:Gate|a:One@2|b:Two@2');
    const r = scoreSlotSheet(gated, {
      g: { verdict: 'absent' }, a: { verdict: 'met' }, b: { verdict: 'met' },
    });
    expect(r).toEqual({ score: 0, max: 4, failed: ['g'] });
  });

  it('ignores a passing gate when totalling, since a gate carries no points', () => {
    const gated = parseSlots('!g:Gate|a:One@2|b:Two@2');
    const r = scoreSlotSheet(gated, {
      g: { verdict: 'met' }, a: { verdict: 'met' }, b: { verdict: 'absent' },
    });
    expect(r).toEqual({ score: 2, max: 4, failed: ['b'] });
  });

  it('reproduces a real rubric item: eight checks at 1.25, six unmet', () => {
    const q6 = parseSlots(
      ['state_a1:A1@1.25', 'change_a1:C1@1.25', 'state_a2:A2@1.25', 'change_a2:C2@1.25',
       'state_c1:S1@1.25', 'affect_c1:E1@1.25', 'state_c2:S2@1.25', 'affect_c2:E2@1.25'].join('|'),
      ['met', 'absent', 'mismatch', 'not_described'],
    );
    const verdicts = {
      state_a1: { verdict: 'met' }, change_a1: { verdict: 'not_described' },
      state_a2: { verdict: 'met' }, change_a2: { verdict: 'not_described' },
      state_c1: { verdict: 'absent' }, affect_c1: { verdict: 'absent' },
      state_c2: { verdict: 'absent' }, affect_c2: { verdict: 'absent' },
    };
    const r = scoreSlotSheet(q6, verdicts)!;
    expect(r.max).toBe(10);
    expect(r.score).toBe(2.5);      // 10 - 6 x 1.25
    expect(r.failed).toHaveLength(6);
  });

  it('with an explicit max, @n is a COST and costs may exceed the item', () => {
    // A daily operant-conditioning example: 4 points, but "not operant
    // conditioning" alone costs 4 while type costs 2 and behaviour costs 1.
    const oc = parseSlots(
      '!is_oc:Is a contingency@4|matches_type:Matches your chosen type@2'
      + '|targets_own:Aimed at your own behaviour@1',
      ['yes', 'no'],
    );
    const met = { is_oc: { verdict: 'yes' }, matches_type: { verdict: 'yes' }, targets_own: { verdict: 'yes' } };
    expect(scoreSlotSheet(oc, met, 4)).toEqual({ score: 4, max: 4, failed: [] });

    // wrong type only -> 2
    expect(scoreSlotSheet(oc, { ...met, matches_type: { verdict: 'no' } }, 4))
      .toEqual({ score: 2, max: 4, failed: ['matches_type'] });

    // wrong behaviour only -> 3
    expect(scoreSlotSheet(oc, { ...met, targets_own: { verdict: 'no' } }, 4))
      .toEqual({ score: 3, max: 4, failed: ['targets_own'] });

    // both -> 1, because these two stack in the dictionary
    expect(scoreSlotSheet(oc, { ...met, matches_type: { verdict: 'no' }, targets_own: { verdict: 'no' } }, 4))
      .toEqual({ score: 1, max: 4, failed: ['matches_type', 'targets_own'] });

    // the gate voids the item whatever else is met
    expect(scoreSlotSheet(oc, { ...met, is_oc: { verdict: 'no' } }, 4))
      .toEqual({ score: 0, max: 4, failed: ['is_oc'] });
  });

  it('an explicit max that equals the sum changes nothing — the readings coincide', () => {
    const additive = parseSlots('a:One@2|b:Two@1|c:Three@1');
    const checks = { a: { verdict: 'absent' }, b: { verdict: 'met' }, c: { verdict: 'met' } };
    expect(scoreSlotSheet(additive, checks)).toEqual(scoreSlotSheet(additive, checks, 4));
  });

  it('is still null with no costs and no max', () => {
    expect(scoreSlotSheet(parseSlots('a:One|b:Two'), {})).toBeNull();
  });

  it('never goes below zero', () => {
    const r = scoreSlotSheet(parseSlots('a:One@2|b:Two@2'), {
      a: { verdict: 'absent' }, b: { verdict: 'absent' },
    });
    expect(r!.score).toBe(0);
  });
});

describe('failedGate', () => {
  const slots = parseSlots('!g:Gate|a:One');

  it('finds an unsatisfied gate', () => {
    expect(failedGate(slots, { g: { verdict: 'absent' } })?.key).toBe('g');
  });

  it('returns null when the gate passes', () => {
    expect(failedGate(slots, { g: { verdict: 'met' }, a: { verdict: 'absent' } })).toBeNull();
  });

  it('treats a missing verdict as a failed gate, never a passing one', () => {
    expect(failedGate(slots, {})?.key).toBe('g');
  });

  it('ignores non-gating slots', () => {
    expect(failedGate(parseSlots('a:One'), { a: { verdict: 'absent' } })).toBeNull();
  });
});

describe('buildSlotSchema', () => {
  const slots = parseSlots('a:One|b:Two:yes/no');

  it('makes every slot a required property, which is the point', () => {
    const schema: any = buildSlotSchema(slots);
    expect(schema.properties.checks.required).toEqual(['a', 'b']);
    expect(schema.properties.checks.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['checks', 'feedback']);
  });

  it('generates the checks before the prose, so feedback follows the verdicts', () => {
    const schema: any = buildSlotSchema(slots);
    expect(Object.keys(schema.properties)).toEqual(['checks', 'feedback']);
  });

  it('carries each slot own verdict enum', () => {
    const schema: any = buildSlotSchema(slots);
    expect(schema.properties.checks.properties.a.properties.verdict.enum).toEqual(DEFAULT_VERDICTS);
    expect(schema.properties.checks.properties.b.properties.verdict.enum).toEqual(['yes', 'no']);
  });
});

describe('composeSlotFeedback', () => {
  const slots = parseSlots('a:One|b:Two');

  it('ticks the satisfied verdict and leaves others neutral', () => {
    const out = composeSlotFeedback(slots, {
      checks: { a: { verdict: 'met' }, b: { verdict: 'absent' } },
      feedback: 'Good start.',
    });
    expect(out).toContain('Good start.');
    expect(out).toContain('- ✓ **One** — met');
    expect(out).toContain('- · **Two** — absent');
  });

  it('never renders a missing verdict as satisfied', () => {
    const out = composeSlotFeedback(slots, { checks: {}, feedback: 'x' });
    expect(out).not.toContain('✓');
    expect((out.match(/not reported/g) ?? []).length).toBe(2);
  });

  it('does not mark an informational slot as a failure with a cross', () => {
    const kind = parseSlots('kind:Which type:PR/NR/PP/NP/none');
    const out = composeSlotFeedback(kind, {
      checks: { kind: { verdict: 'PP' } },
      feedback: '',
    });
    expect(out).toContain('· **Which type** — PP');
    expect(out).not.toContain('✗');
  });

  it('hides the checklist but keeps the prose when showChecks is false', () => {
    const data = { checks: { a: { verdict: 'met' }, b: { verdict: 'absent' } }, feedback: 'Nice.' };
    const out = composeSlotFeedback(slots, data, { showChecks: false });
    expect(out).toBe('Nice.');
    expect(out).not.toContain('What I checked');
    // the default is still to show them
    expect(composeSlotFeedback(slots, data)).toContain('What I checked');
  });

  it('reports a failed gate alone, since the rest is moot', () => {
    const gated = parseSlots('!counterpart:About the same behavior|a:One|b:Two');
    const out = composeSlotFeedback(gated, {
      checks: {
        counterpart: { verdict: 'absent' },
        a: { verdict: 'met' },
        b: { verdict: 'met' },
      },
      feedback: 'Have another look at your goal.',
    });
    expect(out).toContain('· **About the same behavior** — absent');
    expect(out).not.toContain('**One**');
    expect(out).not.toContain('**Two**');
    expect(out).toContain('Start here');
  });

  it('shows every slot when the gate passes', () => {
    const gated = parseSlots('!counterpart:About the same behavior|a:One|b:Two');
    const out = composeSlotFeedback(gated, {
      checks: {
        counterpart: { verdict: 'met' },
        a: { verdict: 'met' },
        b: { verdict: 'absent' },
      },
      feedback: '',
    });
    expect(out).toContain('**One**');
    expect(out).toContain('**Two**');
    expect(out).not.toContain('Start here');
  });

  it('survives a malformed payload', () => {
    expect(() => composeSlotFeedback(slots, {})).not.toThrow();
    expect(() => composeSlotFeedback([], { feedback: 'only prose' })).not.toThrow();
    expect(composeSlotFeedback([], { feedback: 'only prose' })).toBe('only prose');
  });
});

// ─── The slot sheets authored in content ────────────────────────────────────

const CONTENT_FILES = [
  'content/psychology/bmod_handout1.olx',
  'content/psychology/bmod_handout2.olx',
  'content/psychology/bmod_handout3.olx',
];

/** Every LLMAction with a slots= attribute, as (id, slots, verdicts). */
function authoredSheets(src: string) {
  const out: { id: string; slots: string; verdicts: string[] }[] = [];
  for (const tag of src.match(/<LLMAction\b[^>]*?>/gs) ?? []) {
    const slots = /slots="([^"]*)"/s.exec(tag);
    if (!slots) continue;
    const verdicts = /verdicts="([^"]*)"/s.exec(tag);
    out.push({
      id: (/id="([^"]*)"/.exec(tag) ?? [, '?'])[1] as string,
      slots: slots[1],
      verdicts: verdicts
        ? verdicts[1].split(',').map(v => v.trim()).filter(Boolean)
        : DEFAULT_VERDICTS,
    });
  }
  return out;
}

describe('slot sheets authored in psychology content', () => {
  const present = CONTENT_FILES.filter(existsSync);

  it('finds the sheets to check', () => {
    // Skip rather than fail if this checkout has no psychology content.
    if (present.length === 0) return;
    const total = present.reduce(
      (n, f) => n + authoredSheets(readFileSync(f, 'utf8')).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  for (const file of CONTENT_FILES.filter(existsSync)) {
    for (const sheet of authoredSheets(readFileSync(file, 'utf8'))) {
      it(`${sheet.id} declares a usable sheet`, () => {
        const slots: SlotSpec[] = parseSlots(sheet.slots, sheet.verdicts);
        expect(slots.length).toBeGreaterThan(0);

        const keys = slots.map(s => s.key);
        expect(new Set(keys).size).toBe(keys.length);          // no duplicate properties
        for (const slot of slots) {
          expect(slot.key).toMatch(/^[a-z0-9_]+$/);            // usable as a JSON key
          expect(slot.label.trim().length).toBeGreaterThan(0);
          expect(slot.options.length).toBeGreaterThan(1);      // a one-value enum asks nothing
          expect(new Set(slot.options).size).toBe(slot.options.length);
        }

        const schema: any = buildSlotSchema(slots);
        expect(schema.properties.checks.required).toEqual(keys);
        // Round-trips: a fully satisfied sheet ticks every line.
        const filled = {
          checks: Object.fromEntries(
            slots.map(s => [s.key, { verdict: s.options[0], evidence: 'q' }]),
          ),
          feedback: 'ok',
        };
        const rendered = composeSlotFeedback(slots, filled);
        expect((rendered.match(/✓/g) ?? []).length).toBe(slots.length);
      });
    }
  }
});

// The `checks` field is a contract between two writers (LLMAction after a call,
// DerivedChecks from an effect) and two readers (SlotSheetGrader, and any
// harness measuring the app against gold). These pin the parts a reader relies
// on — particularly showChecks, which the writers had already drifted on: the
// sheet recorded everything about how an item was scored except whether the
// student was ever shown it.
describe('publishedSheet', () => {
  const slots = parseSlots('a:A:met/absent@1|b:B:met/absent@1');
  const verdicts = { a: { verdict: 'met' }, b: { verdict: 'absent' } };

  it('always records showChecks, in both states', () => {
    expect(publishedSheet({ slots, verdicts, showChecks: true }).showChecks).toBe(true);
    expect(publishedSheet({ slots, verdicts, showChecks: false }).showChecks).toBe(false);
  });

  it('records it even when true, so a reader need not assume the default', () => {
    // The distinction that matters: "shown, author took the default" must not
    // look like "written before this key existed".
    expect('showChecks' in publishedSheet({ slots, verdicts, showChecks: true })).toBe(true);
  });

  it('omits empty primitive groups but never showChecks', () => {
    const sheet = publishedSheet({ slots, verdicts, showChecks: false });
    expect(Object.keys(sheet)).toEqual(['slots', 'showChecks', 'verdicts']);
  });

  it('keeps the groups that are present', () => {
    const sheet = publishedSheet({
      slots, verdicts, showChecks: true,
      counts: [{ key: 'c', slots: ['a', 'b'] }],
      equals: [{ key: 'e', left: 'a', right: 'b', lenient: [] }],
    });
    expect(Object.keys(sheet)).toContain('counts');
    expect(Object.keys(sheet)).toContain('equals');
    expect(Object.keys(sheet)).not.toContain('cover');
  });

  it('coerces max and omits it when unset', () => {
    expect(publishedSheet({ slots, verdicts, showChecks: true, max: '7' }).max).toBe(7);
    expect('max' in publishedSheet({ slots, verdicts, showChecks: true })).toBe(false);
    expect('max' in publishedSheet({ slots, verdicts, showChecks: true, max: '' })).toBe(false);
  });

  it('survives a JSON round trip, which is how it is actually stored', () => {
    const sheet = publishedSheet({ slots, verdicts, showChecks: false, max: 4 });
    expect(JSON.parse(JSON.stringify(sheet))).toEqual(sheet);
  });
});

// A shown checklist changes the shape of the answer: one note per check instead
// of one paragraph. Both halves have to move together — a schema with notes and
// no guidance produces notes that restate the verdict, and guidance with no
// schema produces bullets buried in `feedback` that the renderer cannot place.
describe('per-check notes when the checklist is shown', () => {
  const slots = parseSlots('a:First:met/absent@1|b:Second:met/absent@1');

  it('asks for a note on every check, and requires it', () => {
    const schema: any = buildSlotSchema(slots, [], [], [], true);
    for (const k of ['a', 'b']) {
      expect(Object.keys(schema.properties.checks.properties[k].properties)).toContain('note');
      expect(schema.properties.checks.properties[k].required).toContain('note');
    }
  });

  it('asks for no note when the checklist is hidden', () => {
    const schema: any = buildSlotSchema(slots, [], [], [], false);
    expect(Object.keys(schema.properties.checks.properties.a.properties)).not.toContain('note');
    expect(schema.properties.checks.properties.a.required).not.toContain('note');
  });

  it('defaults to no notes, so an unchanged caller gets the old schema', () => {
    const schema: any = buildSlotSchema(slots);
    expect(Object.keys(schema.properties.checks.properties.a.properties)).not.toContain('note');
  });

  it('never asks for a note on a check the grader computes', () => {
    // A computed check leaves the schema entirely; adding notes must not
    // resurrect it as a property the model is asked to fill.
    const schema: any = buildSlotSchema(
      parseSlots('a:A:x/y@1|b:B:x/y@1|c:C:x/y@1'),
      [{ key: 'c', left: 'a', right: 'b', lenient: [] }], [], [], true);
    expect(Object.keys(schema.properties.checks.properties)).toEqual(['a', 'b']);
  });

  it('renders each note under its own check', () => {
    const out = composeSlotFeedback(slots, {
      feedback: 'OPENING',
      checks: {
        a: { verdict: 'met', note: 'You named it clearly.' },
        b: { verdict: 'absent', note: 'Add a second one.' },
      },
    }, { showChecks: true });
    expect(out).toContain('OPENING');
    // Each note sits after its own check line, not gathered at the end.
    expect(out.indexOf('You named it clearly.')).toBeGreaterThan(out.indexOf('**First**'));
    expect(out.indexOf('You named it clearly.')).toBeLessThan(out.indexOf('**Second**'));
    expect(out.indexOf('Add a second one.')).toBeGreaterThan(out.indexOf('**Second**'));
  });

  it('renders a plain list when a sheet carries no notes', () => {
    // Sheets published before per-check notes must still render.
    const out = composeSlotFeedback(slots, {
      feedback: 'OPENING', checks: { a: { verdict: 'met' }, b: { verdict: 'absent' } },
    }, { showChecks: true });
    expect(out).toContain('✓ **First** — met');
    expect(out).not.toMatch(/undefined/);
  });

  it('flattens a multi-line note so it stays inside its list item', () => {
    const out = composeSlotFeedback(slots, {
      checks: { a: { verdict: 'met', note: 'One.\n\nTwo.' }, b: { verdict: 'met' } },
    }, { showChecks: true });
    expect(out).toContain('One. Two.');
  });

  it('guidance is present when shown and empty when hidden', () => {
    expect(checklistGuidance(true)).toMatch(/directly underneath/);
    expect(checklistGuidance(false)).toBe('');
  });

  // Length is capped in BOTH places on purpose: the schema description is what
  // the model reads while filling that one property, the guidance is what it
  // reads while planning the whole answer. Saying it once left notes that were
  // individually reasonable and collectively a wall of text.
  // The rubric is written for a grader and is dense with shorthand; all of it is
  // in the prompt, so all of it is within reach of the prose. The student never
  // saw the rubric, so "your UTB is clear" is feedback they must decode first —
  // and whoever is most stuck is least able to decode it.
  it('tells the model to spell out the rubric\'s abbreviations', () => {
    expect(slotSheetGuidance(true)).toMatch(/SPELL OUT every abbreviation/);
  });

  it('applies that rule even when the checklist is hidden', () => {
    // Hidden checks still produce prose the student reads. Tying this to
    // showChecks would exempt exactly the items that show nothing BUT prose.
    const hidden = slotSheetGuidance(false);
    expect(hidden).toMatch(/SPELL OUT every abbreviation/);
    expect(hidden).not.toMatch(/AT MOST TWO SHORT SENTENCES/);
    expect(checklistGuidance(false)).toBe('');
  });

  // The prompt addresses the model as "you"; so does the feedback address the
  // student. A rubric line about the grader's own work carries the wrong "you"
  // straight into the student's feedback if nothing says otherwise.
  it('redirects scorer-directed second person to the first person', () => {
    for (const shown of [true, false]) {
      const g = slotSheetGuidance(shown);
      expect(g).toMatch(/"You" in the prose you write means THE STUDENT/);
      expect(g).toMatch(/switch to the first person/);
    }
  });

  // Each note is read beside its own check, not as part of a paragraph, so a
  // demonstrative has no antecedent to resolve against: "that sentence" names
  // nothing the student can find, and the ones most in need of the feedback are
  // the least able to guess.
  it('forbids references the student cannot resolve', () => {
    for (const shown of [true, false]) {
      const g = slotSheetGuidance(shown);
      expect(g).toMatch(/NEVER refer to something the student cannot see/);
      expect(g).toMatch(/that sentence/);
    }
  });

  it('tells the model the evidence is displayed, not to re-quote it', () => {
    // The referent is supplied structurally: the model already located the span
    // to decide the verdict, so asking it to quote again in prose repeats work
    // the schema had done and can drift from what was actually cited.
    expect(slotSheetGuidance(true)).toMatch(/displayed directly above its note/);
    const schema: any = buildSlotSchema(slots, [], [], [], true);
    expect(schema.properties.checks.properties.a.properties.note.description)
      .toMatch(/Do NOT re-quote the student/);
    expect(schema.properties.checks.properties.a.properties.evidence.description)
      .toMatch(/SHOWN TO THE STUDENT/);
  });

  it('leaves evidence described as internal when the checklist is hidden', () => {
    const plain: any = buildSlotSchema(slots, [], [], [], false);
    expect(plain.properties.checks.properties.a.properties.evidence.description)
      .not.toMatch(/SHOWN TO THE STUDENT/);
  });

  it('renders evidence above the note, under its own check', () => {
    const out = composeSlotFeedback(slots, {
      checks: {
        a: { verdict: 'met', evidence: '"I sleep six hours"', note: 'Clear and specific.' },
        b: { verdict: 'absent', evidence: 'No statement about why.', note: 'Add a reason.' },
      },
    }, { showChecks: true });
    expect(out).toContain('*"I sleep six hours"*');
    expect(out.indexOf('"I sleep six hours"')).toBeGreaterThan(out.indexOf('**First**'));
    expect(out.indexOf('"I sleep six hours"')).toBeLessThan(out.indexOf('Clear and specific.'));
    expect(out.indexOf('Clear and specific.')).toBeLessThan(out.indexOf('**Second**'));
  });

  it('omits evidence that is a placeholder rather than a citation', () => {
    // Seen in real runs on checks the model was not asked about: the word
    // "None" rendered to a student is worse than rendering nothing.
    for (const ev of ['None', 'none.', 'N/A', 'null', '   ']) {
      const out = composeSlotFeedback(slots, {
        checks: { a: { verdict: 'met', evidence: ev }, b: { verdict: 'met' } },
      }, { showChecks: true });
      expect(out).not.toMatch(/\*None\.?\*|\*N\/A\*|\*null\*/i);
    }
  });

  it('renders a bare line when a check has neither evidence nor note', () => {
    const out = composeSlotFeedback(slots, {
      checks: { a: { verdict: 'met' }, b: { verdict: 'met' } },
    }, { showChecks: true });
    expect(out).toContain('✓ **First** — met');
    expect(out).not.toMatch(/undefined/);
  });

  // Hiding the checklist removes the structure that was doing the compressing:
  // each comment was pinned to one check and capped at two sentences. With one
  // open field and the whole sheet in view, nothing says stop, and these are
  // exactly the items chosen to be graded gently.
  it('bounds the prose when the checklist is hidden', () => {
    const hidden = slotSheetGuidance(false);
    expect(hidden).toMatch(/FOUR SENTENCES AT MOST/);
    expect(hidden).toMatch(/ONLY thing|NOTHING else/);
    // ...and does not smuggle in rules about a list that is not displayed.
    expect(hidden).not.toMatch(/directly underneath/);
  });

  it('does not apply the prose budget when the checklist is shown', () => {
    // There the notes carry the detail and the opening is already capped at
    // one or two sentences; a second, larger budget would just contradict it.
    expect(slotSheetGuidance(true)).not.toMatch(/FOUR SENTENCES AT MOST/);
  });

  it('states the budget in the schema too, only for the hidden case', () => {
    const plain: any = buildSlotSchema(slots, [], [], [], false);
    const shown: any = buildSlotSchema(slots, [], [], [], true);
    expect(plain.properties.feedback.description).toMatch(/FOUR SENTENCES AT MOST/);
    expect(shown.properties.feedback.description).not.toMatch(/FOUR SENTENCES AT MOST/);
  });

  it('composes the student-facing rules before the display rules', () => {
    const shown = slotSheetGuidance(true);
    expect(shown.indexOf('WRITING TO THE STUDENT'))
      .toBeLessThan(shown.indexOf('HOW THIS FEEDBACK IS DISPLAYED'));
  });

  it('repeats the spell-out rule in the schema descriptions', () => {
    // Read at a different moment from the guidance: while filling that one
    // property, not while planning the answer.
    const withNotes: any = buildSlotSchema(slots, [], [], [], true);
    const plain: any = buildSlotSchema(slots, [], [], [], false);
    expect(withNotes.properties.checks.properties.a.properties.note.description)
      .toMatch(/Spell out any abbreviation/);
    expect(withNotes.properties.feedback.description).toMatch(/Spell out any abbreviation/);
    expect(plain.properties.feedback.description).toMatch(/Spell out any abbreviation/);
  });

  it('caps note length in the guidance and in the schema', () => {
    expect(checklistGuidance(true)).toMatch(/AT MOST TWO SHORT SENTENCES/);
    const schema: any = buildSlotSchema(slots, [], [], [], true);
    expect(schema.properties.checks.properties.a.properties.note.description)
      .toMatch(/AT MOST TWO SHORT SENTENCES/);
  });
});

// ---------------------------------------------------------------------------
// Verdict display — the student-facing half of a shared vocabulary.
// ---------------------------------------------------------------------------
describe('displayVerdict', () => {
  it('turns internal tokens into something a student can read', () => {
    // The shipped leak: snake_case reaching the checklist line verbatim.
    expect(displayVerdict('not_antecedent')).toBe('not an antecedent');
    expect(displayVerdict('tick_values')).toBe("these are the axis's values, not a label");
    expect(displayVerdict('wrong_kind')).toBe('not the kind of thing asked for');
  });

  it('passes unknown tokens through verbatim', () => {
    // Identity values are CONTENT, not judgements — "PR" is the answer, and
    // reads correctly as itself. A sheet published before a token was named
    // must render too, rather than showing a blank where a verdict was.
    expect(displayVerdict('PR')).toBe('PR');
    expect(displayVerdict('first')).toBe('first');
    expect(displayVerdict('some_future_token')).toBe('some_future_token');
  });

  it('treats an unanswered check as empty, not as the word', () => {
    // composeSlotFeedback falls back to "not reported" on empty; returning
    // "undefined"/"null" here would print those words to a student.
    expect(displayVerdict(undefined)).toBe('');
    expect(displayVerdict(null)).toBe('');
    expect(displayVerdict('   ')).toBe('');
  });

  it('renders the checklist line through the map', () => {
    const slots = parseSlots('a:First antecedent is a genuine trigger:met/absent/not_antecedent');
    const out = composeSlotFeedback(
      slots,
      { feedback: '', checks: { a: { verdict: 'not_antecedent' } } } as any,
      { showChecks: true },
    );
    expect(out).toContain('not an antecedent');
    expect(out).not.toContain('not_antecedent');
  });
});

// ---------------------------------------------------------------------------
// Identification and measurement leave `verdict`.
//
// `refers_to` and `count` are read in preference to `verdict` where a check
// supplies them, so an item can move to the new shape on its own while its
// neighbours still use the old one. Both paths are pinned: the fallback IS the
// unmigrated content, and breaking it would break every item at once.
// ---------------------------------------------------------------------------
describe('refers_to and count', () => {
  // Migrated shape: the slots are ordinary judgements, and the cover group
  // supplies the list they choose from. The legacy shape (the reference spelled
  // as the verdict) is exercised by its own case below.
  const coverSlots = parseSlots('a:Box one|b:Box two');
  const legacySlots = parseSlots('a:Box one:first/second/neither|b:Box two:first/second/neither');
  const cover = parseCover('a,b:first,second');

  it('covers from refers_to when the check supplies it', () => {
    const sat = satisfiedMap(coverSlots, {
      a: { verdict: 'met', refers_to: 'first' },
      b: { verdict: 'met', refers_to: 'second' },
    }, cover);
    expect(sat.a).toBe(true);
    expect(sat.b).toBe(true);
  });

  it('still refuses to let two checks claim the same item', () => {
    // The no-double-counting rule is the whole point of cover; it must survive
    // the move to a different field.
    const sat = satisfiedMap(coverSlots, {
      a: { verdict: 'met', refers_to: 'first' },
      b: { verdict: 'met', refers_to: 'first' },
    }, cover);
    expect(sat.a).toBe(true);
    expect(sat.b).toBe(false);
  });

  it('falls back to verdict for a check that has not migrated', () => {
    const sat = satisfiedMap(legacySlots, {
      a: { verdict: 'first' },
      b: { verdict: 'second' },
    }, cover);
    expect(sat.a).toBe(true);
    expect(sat.b).toBe(true);
  });

  it('counts from count, and still from a numeric verdict', () => {
    const slots = parseSlots('n:How many:3/2/1/0|r1:First@1|r2:Second@1|r3:Third@1');
    const counts = parseCounts('n:r1,r2,r3');

    const fromCount = satisfiedMap(slots, { n: { count: 2 } }, [], [], counts);
    expect([fromCount.r1, fromCount.r2, fromCount.r3]).toEqual([true, true, false]);

    const fromVerdict = satisfiedMap(slots, { n: { verdict: '2' } }, [], [], counts);
    expect([fromVerdict.r1, fromVerdict.r2, fromVerdict.r3]).toEqual([true, true, false]);
  });
});

describe('isSatisfied', () => {
  it('reads `met` by name wherever it sits in the list', () => {
    // The order an author wrote the options in stops deciding satisfaction.
    const byName = { key: 'k', label: 'L', options: ['absent', 'met'], gates: false };
    expect(isSatisfied(byName as any, 'met')).toBe(true);
    expect(isSatisfied(byName as any, 'absent')).toBe(false);
  });

  it('still reads a non-judgement vocabulary positionally', () => {
    // Identity slots have no `met`; they keep the old rule until they are
    // migrated out of `verdict` entirely.
    const positional = { key: 'k', label: 'L', options: ['PR', 'NR', 'PP'], gates: false };
    expect(isSatisfied(positional as any, 'PR')).toBe(true);
    expect(isSatisfied(positional as any, 'NR')).toBe(false);
  });

  it('agrees with the positional rule on every current vocabulary', () => {
    // The migration's safety argument, as a test: no vocabulary in the
    // handouts carries `met` anywhere but first, so switching to by-name
    // cannot move a score on today's content.
    for (const opts of [
      ['met', 'absent', 'unclear'], ['met', 'absent'],
      ['met', 'absent', 'not_antecedent'], ['met', 'absent', 'not_active'],
      ['met', 'absent', 'not_consequence', 'duplicate'],
      ['met', 'absent', 'mismatch', 'not_described'],
      ['met', 'absent', 'tick_values', 'generic'], ['met', 'absent', 'incomplete'],
    ]) {
      const slot = { key: 'k', label: 'L', options: opts, gates: false } as any;
      for (const v of opts) {
        expect(isSatisfied(slot, v), `${opts.join('/')} → ${v}`).toBe(v === opts[0]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The extras form: authors add to a judgement, they do not restate it.
// ---------------------------------------------------------------------------
describe('resolveOptions', () => {
  it('gives a bare slot the default judgement, without unclear', () => {
    // `unclear` is an escape hatch; handing one to every check costs points on
    // the 24 scored slots that deliberately do without it.
    expect(resolveOptions(undefined, DEFAULT_VERDICTS)).toEqual(['met', 'absent']);
    expect(DEFAULT_VERDICTS).not.toContain('unclear');
  });

  it('adds declared extras to the judgement', () => {
    expect(resolveOptions('unclear', DEFAULT_VERDICTS)).toEqual(['met', 'absent', 'unclear']);
    expect(resolveOptions('wrong_kind', DEFAULT_VERDICTS)).toEqual(['met', 'absent', 'wrong_kind']);
    expect(resolveOptions('unclear/duplicate', DEFAULT_VERDICTS))
      .toEqual(['met', 'absent', 'unclear', 'duplicate']);
  });

  it('reads a non-extras list as a legacy full list', () => {
    // How the identity vocabularies keep parsing until they move out of
    // `verdict`. Unambiguous because met/absent are never extras.
    expect(resolveOptions('PR/NR/PP/NP/none', DEFAULT_VERDICTS))
      .toEqual(['PR', 'NR', 'PP', 'NP', 'none']);
    expect(resolveOptions('met/absent/unclear', DEFAULT_VERDICTS))
      .toEqual(['met', 'absent', 'unclear']);
    expect(resolveOptions('first/second/neither/absent', DEFAULT_VERDICTS))
      .toEqual(['first', 'second', 'neither', 'absent']);
  });

  it('resolves the two forms of the same slot identically', () => {
    // The migration's whole claim: shortening an explicit list cannot move a
    // score, because both spellings produce the same options.
    const long = parseSlots('a:Label:met/absent/unclear@2');
    const short = parseSlots('a:Label:unclear@2');
    expect(short).toEqual(long);

    const longPlain = parseSlots('b:Label:met/absent@1');
    const shortPlain = parseSlots('b:Label@1');
    expect(shortPlain).toEqual(longPlain);
  });
});

// ---------------------------------------------------------------------------
// Counts are measurements, not judgements.
// ---------------------------------------------------------------------------
describe('count slots', () => {
  it('parses count(N) and carries no verdict list', () => {
    const [slot] = parseSlots('n:How many reasons name a negative effect:count(3)');
    expect(slot.countMax).toBe(3);
    expect(slot.options).toEqual([]);
  });

  it('asks the model for an integer in range, not a verdict', () => {
    const schema = buildSlotSchema(parseSlots('n:How many:count(3)'));
    const prop: any = (schema as any).properties.checks.properties.n.properties;
    expect(prop.count).toMatchObject({ type: 'integer', minimum: 0, maximum: 3 });
    expect(prop.verdict).toBeUndefined();
  });

  it('drives its member checks from the number', () => {
    const slots = parseSlots('n:How many:count(3)|r1:First@1|r2:Second@1|r3:Third@1');
    const sat = satisfiedMap(slots, { n: { count: 2 } }, [], [], parseCounts('n:r1,r2,r3'));
    expect([sat.r1, sat.r2, sat.r3]).toEqual([true, true, false]);
  });

  it('reports the number to the student instead of a tick', () => {
    // "2 of 3" did not pass or fail on its own; the member checks carry that.
    const slots = parseSlots('n:How many reasons:count(3)|r1:First@1');
    const out = composeSlotFeedback(
      slots,
      { feedback: '', checks: { n: { count: 2 }, r1: { verdict: 'met' } } } as any,
      { showChecks: true, counts: parseCounts('n:r1') },
    );
    expect(out).toContain('**How many reasons** — 2');
    expect(out).not.toContain('✓ **How many reasons**');
  });
});

describe('schema validity', () => {
  // Strict structured output requires `required` to name EVERY key in
  // `properties`. Get that wrong and the provider rejects the whole request
  // with a 400 — every call for the item fails, the harness retries, and a
  // ten-minute run becomes fifty. It cost exactly that when `count` was added
  // to properties while `required` still said `verdict`, and no unit test
  // noticed because both halves were individually correct.
  const everyCheckRequiresAllItsProperties = (schema: any) => {
    const checks = schema.properties.checks.properties;
    for (const [key, spec] of Object.entries<any>(checks)) {
      expect(new Set(spec.required), `slot '${key}'`)
        .toEqual(new Set(Object.keys(spec.properties)));
    }
  };

  it('holds for judgements, counts and per-check notes alike', () => {
    const slots = parseSlots(
      'a:Plain@1|b:With extras:unclear/duplicate@1|n:How many:count(3)|r1:Member@1');
    for (const notes of [false, true]) {
      everyCheckRequiresAllItsProperties(
        buildSlotSchema(slots, [], [], parseCounts('n:r1'), notes));
      // ...and with a cover group, which adds `refers_to` to its members.
      everyCheckRequiresAllItsProperties(
        buildSlotSchema(slots, [], [], parseCounts('n:r1'), notes,
                        parseCover('a,b:first,second')));
    }
  });

  it('asks a count for `count` and never for `verdict`', () => {
    const schema: any = buildSlotSchema(parseSlots('n:How many:count(2)'));
    const spec = schema.properties.checks.properties.n;
    expect(spec.required).toContain('count');
    expect(spec.required).not.toContain('verdict');
  });
});

describe('cover once the reference is its own field', () => {
  const slots = parseSlots('a:Box one@1|b:Box two@1');
  const cover = parseCover('a,b:first,second');

  it('needs the check to have answered AND to name a distinct item', () => {
    // Separating the fields makes a contradiction expressible — "nothing here"
    // while also naming one of the required items — so both now have to hold.
    const sat = satisfiedMap(slots, {
      a: { verdict: 'absent', refers_to: 'first' },
      b: { verdict: 'met', refers_to: 'second' },
    }, cover);
    expect(sat.a).toBe(false);
    expect(sat.b).toBe(true);
  });

  it('offers the group\'s own labels plus none, whatever the arity', () => {
    // The generalisation: nothing here knows the list is two long.
    const five = parseCover('a,b:one,two,three,four,five');
    const schema: any = buildSlotSchema(slots, [], [], [], false, five);
    expect(schema.properties.checks.properties.a.properties.refers_to.enum)
      .toEqual(['one', 'two', 'three', 'four', 'five', 'none']);
    expect(schema.properties.checks.properties.a.required).toContain('refers_to');
  });

  it('treats `none` as naming nothing on the list', () => {
    const sat = satisfiedMap(slots, {
      a: { verdict: 'met', refers_to: 'none' },
      b: { verdict: 'met', refers_to: 'first' },
    }, cover);
    expect(sat.a).toBe(false);
    expect(sat.b).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Classifications: the categories are content, the comparison is a rule.
//
// PR/NR/PP/NP were never verdicts — they are the subject matter. Routed through
// `verdict` they forced the satisfied-first convention to double as an answer
// key, which is why one question appeared four times with its list permuted.
// ---------------------------------------------------------------------------
describe('pick and expect', () => {
  const CHOICES = parseChoices('operant_type:PR,NR,PP,NP,none');

  it('declares a set once and draws the enum from it', () => {
    const slots = parseSlots('t:Which type this shows:pick(operant_type)');
    expect(slots[0].picks).toBe('operant_type');
    expect(slots[0].options).toEqual([]);          // not a verdict list

    const schema: any = buildSlotSchema(slots, [], [], [], false, [], CHOICES, []);
    const spec = schema.properties.checks.properties.t;
    expect(spec.properties.refers_to.enum).toEqual(['PR', 'NR', 'PP', 'NP', 'none']);
    expect(spec.properties.verdict).toBeUndefined();
    expect(new Set(spec.required)).toEqual(new Set(Object.keys(spec.properties)));
  });

  it('names the expected answer out loud instead of by list order', () => {
    const slots = parseSlots('t:Which type:pick(operant_type)|ok:Right type@2');
    const expectRules = parseExpect('ok:t=PP:none');
    expect(expectRules).toEqual([{ key: 'ok', left: 't', value: 'PP', lenient: ['none'] }]);

    const hit = satisfiedMap(slots, { t: { refers_to: 'PP' } }, [], [], [], expectRules);
    expect(hit.ok).toBe(true);
    const miss = satisfiedMap(slots, { t: { refers_to: 'NR' } }, [], [], [], expectRules);
    expect(miss.ok).toBe(false);
  });

  it('treats a lenient member as establishing nothing, not as a mismatch', () => {
    // The same rule `equals` follows: a category nobody could determine is not
    // a mismatch to charge.
    const slots = parseSlots('t:Which type:pick(operant_type)|ok:Right type@2');
    const rules = parseExpect('ok:t=PP:none');
    expect(satisfiedMap(slots, { t: { refers_to: 'none' } }, [], [], [], rules).ok).toBe(true);
  });

  it('lets `equals` compare two picks', () => {
    const slots = parseSlots('a:Shows:pick(operant_type)|b:Chose:pick(operant_type)|m:Match@2');
    const eq = parseEquals('m:a,b:none');
    const agree = satisfiedMap(slots, { a: { refers_to: 'NR' }, b: { refers_to: 'NR' } }, [], eq);
    expect(agree.m).toBe(true);
    const differ = satisfiedMap(slots, { a: { refers_to: 'NR' }, b: { refers_to: 'PP' } }, [], eq);
    expect(differ.m).toBe(false);
  });

  it('reports the category to the student without a tick', () => {
    // "this is Negative Punishment" did not pass or fail; the rule that reads
    // it carries the judgement. Answering correctly used to render as a dot.
    const slots = parseSlots('t:Which type this shows:pick(operant_type)');
    const out = composeSlotFeedback(slots, { feedback: '', checks: { t: { refers_to: 'NP' } } } as any,
                                    { showChecks: true });
    expect(out).toContain('**Which type this shows** — NP');
    expect(out).not.toContain('· **Which type this shows**');
  });

  it('carries its rules into the published sheet', () => {
    // A stored sheet re-scores by the rules in force when it was written.
    const sheet: any = publishedSheet({
      slots: parseSlots('t:Which:pick(operant_type)'), verdicts: {}, showChecks: true,
      choices: CHOICES, expect: parseExpect('ok:t=PP'),
    });
    expect(sheet.choices).toEqual(CHOICES);
    expect(sheet.expect).toEqual([{ key: 'ok', left: 't', value: 'PP', lenient: [] }]);
  });
});
