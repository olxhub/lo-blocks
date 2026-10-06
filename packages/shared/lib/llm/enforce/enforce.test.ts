// FIRE TESTS. Goal K's standing obligation: "a ported check must FIRE on the
// case its python original fires on, proved by the same fire test, before the
// original retires." A test that only asserts the clean corpus stays clean
// certifies nothing — every one of these rules reports zero today, so a rule
// deleted to `return []` would pass a corpus-only suite.

import { describe, expect, it } from 'vitest';
import { PROBES, RULES, caseNamesInPrompts } from './index';
import { processHistoryFindings } from './processHistory';
import { siblingSlotsShareTheirStructure } from './siblingSlots';
import { verdictSpacesAreDeclared } from './verdictSpaces';
import { consensusDuplicates } from './consensusDuplicates';
import { proseOnlySlotsAreDeclared } from './proseOnlySlots';
import { probeUnreachablePairsStillApply } from './probeUnreachable';
import { handsplitRowsAreDisjoint } from './handsplitDisjoint';
import { declaresCorpusData, everyReferenceHasItsData } from './referenceData';
import { mappedSlotsHaveNoUnreachableVerdict } from './mappedVerdicts';
import { goldSharedProseHasNotDrifted } from './goldSharedProse';
import { sequenceRatio } from './sequenceRatio';
import { noDeclarationCitesASuspectCell } from './suspectCellCitation';
import { shippedTextMatchesDesign } from './shippedTextMatchesDesign';
import { everyPromptFieldIsDesigned } from './promptFieldsAreDesigned';
import { runtimeParsesFailsVerdict } from './runtimeParsesFailsVerdict';
import { goldColumnsAreItemLabels } from './goldColumnsAreItemLabels';
import { actionAttributesAreDeclared } from './actionAttributesDeclared';
import { olxAttributesAreAllGenerated } from './olxAttributesGenerated';
import { responseFixturesAreIntact } from './responseFixturesIntact';
import { consensusSpansAreDisjoint } from './consensusSpansDisjoint';
import { fixtureAgreesWithGold } from './fixtureAgreesWithGold';
import { ruleExamplesAreNotCorpus, norm } from './ruleExamplesNotCorpus';
import { recordsCarryNoMachinePath } from './recordsCarryNoMachinePath';
import { proseOnlyClaimsAreCurrent } from './proseOnlyClaimsCurrent';
import { primitiveConformance } from './primitiveConformance';
import { responseBoxesAreBounded } from './responseBoxesBounded';
import { probeReceiptsMatchShipping } from './probeReceiptsShipping';
import { newSlotsWereProbed } from './newSlotsProbed';
import { writtenRulesReachTheShippedPrompt } from './writtenRulesShipped';
import { questionFor, entries as checklistEntries, derivation } from './probeQuestion';
import { ARGUMENT_FED, NATIVE, NATIVE_BLOCKED, emptyPayloads, nativeCoverage } from './native';
import { SELF_ASSEMBLING } from './runner';

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

describe('native callability', () => {
  // THE REQUIREMENT, and it is enforced here rather than remembered: a rule
  // only python can FEED is a python test written in TypeScript. Every rule
  // needs an assembler, or a declared statement of which derivation is
  // missing. This failed on the day it was written, naming 19 rules.
  it('every rule has a native assembler or a declared reason', () => {
    const gaps = nativeCoverage(Object.keys(RULES));
    expect(gaps).toEqual([]);
  });

  it('a declared reason names what is missing, not just that it is', () => {
    const vague = Object.entries(NATIVE_BLOCKED)
      .filter(([, why]) => why.length <= 40 || !/needs `/.test(why))
      .map(([rule]) => rule);
    expect(vague).toEqual([]);
  });

  // THE VACUOUS-MATCH GUARD. `decodeTable` once handled only the tagged form,
  // so three assemblers returned EMPTY payloads and every one of them "agreed"
  // with python -- because a rule handed nothing finds nothing, and python
  // happened to find nothing too. An empty payload is a broken assembler, not
  // a clean course.
  // 30s, NOT THE 5s DEFAULT. This runs EVERY assembler against the real course,
  // and several now read the response records -- 26 files plus the rubric. They
  // memoise, so the cost is paid once, but it is real I/O and the full suite
  // runs this file under load from a dozen others. It passes in isolation in
  // about a second; raising the budget is the honest fix, and narrowing what
  // the test covers would not be.
  it('no assembler hands its rule an empty payload', () => {
    const ns = 'edu.memphis.psych';
    let gaps: string[];
    try {
      gaps = emptyPayloads(ns, Object.keys(NATIVE));
    } catch {
      return;                      // no course mounted here; nothing to assert
    }
    expect(gaps).toEqual([]);
  }, 30_000);

  it('every assembler is for a rule that exists', () => {
    const orphans = Object.keys(NATIVE).filter(r => !(r in RULES));
    expect(orphans).toEqual([]);
  });

  // A CLEARED RULE MUST HAVE SOMETHING TO CLEAR, which is the converse of the
  // test above and closes the ring. `SELF_ASSEMBLING` is the allowlist of rules
  // the runner may assemble for itself, and it is consulted BEFORE the
  // assembler is looked up: a name on the list with no entry in NATIVE makes a
  // null-payload request come back as an error string instead of findings, and
  // nothing notices while python still passes that rule a payload. A gate's
  // SILENCE IS NOT A CLEARANCE.
  //
  // THIS FOUND NOTHING WHEN IT WAS WRITTEN, and that is recorded deliberately:
  // all 75 cleared rules have assemblers. An earlier draft of this note claimed
  // `link_c2` was in that broken state -- it is not, and it is not a rule at
  // all. It is a SLOT KEY appearing inside a COMMENT in the SELF_ASSEMBLING
  // block, which a scraper that did not strip comments read as a member. The
  // test is PREVENTION, not a repair.
  // ARGUMENT_FED IS A CLAIM THAT CAN GO STALE (QUALITY_CONTROL §5: every
  // declaration table needs a ratchet, or its entries outlive their reason).
  // The claim is that python calls these with ARGUMENTS rather than once per
  // namespace. If one ever acquires an assembler, or gets cleared, the claim
  // was wrong and the rule may be portable after all.
  it('an argument-fed rule has no assembler and is not cleared', () => {
    const wrong = Object.keys(ARGUMENT_FED)
      .filter(r => (r in NATIVE) || SELF_ASSEMBLING.has(r));
    expect(wrong).toEqual([]);
  });

  it('every cleared rule has an assembler', () => {
    const missing = [...SELF_ASSEMBLING].filter(r => !(r in NATIVE));
    expect(missing).toEqual([]);
  });
});

describe('sequenceRatio (CPython difflib)', () => {
  // Values taken from CPython. The port is also verified differentially on 266
  // pairs; these pin the shapes a reader would want to see named.
  it('is 1 for identical and for two empties', () => {
    expect(sequenceRatio('abc', 'abc')).toBe(1);
    expect(sequenceRatio('', '')).toBe(1);
  });

  it('is 0 for disjoint and for one empty', () => {
    expect(sequenceRatio('abc', 'xyz')).toBe(0);
    expect(sequenceRatio('', 'abc')).toBe(0);
  });

  it('counts MATCHED ELEMENTS as 2M/T, not edit distance', () => {
    // 'abcd' vs 'abed': matches 'ab' and 'd' = 3; 2*3/8 = 0.75
    expect(sequenceRatio('abcd', 'abed')).toBeCloseTo(0.75, 12);
  });

  // AUTOJUNK AND THE JUNK-EXTENSION PASS, together. Past 200 elements every
  // 'a' here is "popular" and is dropped from the index, so the main search
  // finds NOTHING through it -- and the ratio is nonetheless 0.8333, because
  // find_longest_match then extends the match over junk. A port that engages
  // autojunk but omits that second extension returns 0 for this pair. Both
  // values are CPython's, checked directly.
  it('engages autojunk past 200 elements AND still extends over junk', () => {
    const long = sequenceRatio('a'.repeat(300), 'a'.repeat(250) + 'b'.repeat(50));
    expect(long).toBeCloseTo(0.8333333333333334, 12);   // == 2*250/600
    // Below the threshold nothing is junk, and the answer is the same number
    // for a different reason -- which is why one case cannot pin both.
    expect(sequenceRatio('a'.repeat(30), 'a'.repeat(25) + 'b'.repeat(5)))
      .toBeCloseTo(0.8333333333333334, 12);
  });
});

describe('gold_shared_prose_has_not_drifted', () => {
  const CANON = 'The gate ceiling applies because the cell was measured and declared.';
  // THE STORED SHAPE, tags and all -- a tuple-keyed python dict cannot be JSON,
  // so the records carry it tagged, and the rule reads exactly what is on disk.
  const cell = (key: unknown[], value: unknown) => [{ __tuple__: key }, value];
  const table = (...rows: unknown[][]) => ({ __dict__: rows });

  it('is silent when a cell is EQUAL to the canonical prose', () => {
    expect(goldSharedProseHasNotDrifted({
      canonical: CANON, cells: table(cell(['1c', 1], CANON)),
    })).toEqual([]);
  });

  it('is silent when a cell is genuinely different prose', () => {
    expect(goldSharedProseHasNotDrifted({
      canonical: CANON,
      cells: table(cell(['1c', 2], 'Something else entirely, said differently.')),
    })).toEqual([]);
  });

  // THE BAND IS THE SIGNAL: nearly-equal means it was a copy that got edited.
  it('FIRES on a copy that has drifted by one word', () => {
    const f = goldSharedProseHasNotDrifted({
      canonical: CANON,
      cells: table(cell(['1c', 3], CANON.replace('measured', 'remeasured'))),
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain("DECLARED_CEILING_CELLS[('1c', 3)]");
    expect(f[0]).toContain('a copy that has drifted');
  });

  // IT RENDERS THE KEY ITSELF. An earlier draft had python pre-render it,
  // which made the rule uncallable from inside lo-blocks.
  it('renders a tuple key the way python reprs it', () => {
    const f = goldSharedProseHasNotDrifted({
      canonical: CANON, cells: table(cell(['NR', 12], CANON + '.')),
    });
    expect(f[0]).toContain("[('NR', 12)]");
  });

  it('says what it got when the canonical declaration is not a string', () => {
    const f = goldSharedProseHasNotDrifted({ canonical: null, cells: {} });
    expect(f).toEqual(['_1C_GATE_CEILING is NoneType, expected the shared prose string']);
  });

  it('ignores a non-string cell rather than comparing it', () => {
    expect(goldSharedProseHasNotDrifted({
      canonical: CANON, cells: table(cell(['1c', 4], 42)),
    })).toEqual([]);
  });
});

describe('mapped_slots_have_no_unreachable_verdict', () => {
  const slot = (o: Partial<Parameters<typeof mappedSlotsHaveNoUnreachableVerdict>[0]['slots'][0]>) => ({
    slots: [{ item: 'Q2', key: 'wgb_inverts_utb', pick: 'p', offered: null,
              rubricVerdicts: [], emits: [], ...o }],
    divergences: [] as Array<[string[], string[]]>,
  });

  it('is silent when the map can emit everything the sheet offers', () => {
    expect(mappedSlotsHaveNoUnreachableVerdict(slot({
      offered: ['met', 'absent'], emits: ['met', 'absent'],
    }))).toEqual([]);
  });

  it('FIRES on a verdict the grader can answer and the map cannot emit', () => {
    const f = mappedSlotsHaveNoUnreachableVerdict(slot({
      offered: ['met', 'absent', 'unclear'], emits: ['met', 'absent'],
    }));
    expect(f).toHaveLength(1);
    expect(f[0]).toContain("offers verdict(s) ['unclear']");
    expect(f[0]).toContain('MAPS cannot emit');
  });

  // THE E52 HOLE: reading the RUBRIC's list let the sheet keep offering a
  // verdict nobody could act on. The SHEET wins whenever it says anything.
  it('prefers the SHEET over the rubric when the sheet spells verdicts out', () => {
    const f = mappedSlotsHaveNoUnreachableVerdict(slot({
      offered: ['met', 'absent', 'unclear'],   // the sheet still offers it
      rubricVerdicts: ['met', 'absent'],       // the rubric dropped it
      emits: ['met', 'absent'],
    }));
    expect(f).toHaveLength(1);
  });

  it('falls back to the rubric only when the sheet says nothing', () => {
    const f = mappedSlotsHaveNoUnreachableVerdict(slot({
      offered: null, rubricVerdicts: ['met', 'absent', 'unclear'], emits: ['met', 'absent'],
    }));
    expect(f).toHaveLength(1);
  });

  // A DECLARED COUNTERPART IS NOT AN ORPHAN -- without this, ~37 of 39
  // rubric-vs-sheet mismatches in this corpus are the design, not defects.
  it('treats a declared counterpart as reachable', () => {
    const p = slot({ offered: ['met', 'wrong_kind'], emits: ['met', 'not_antecedent'] });
    p.divergences = [[['wrong_kind'], ['not_antecedent']]];
    expect(mappedSlotsHaveNoUnreachableVerdict(p)).toEqual([]);
  });

  it('says so when the orphan shares another verdict\'s deduction code', () => {
    const f = mappedSlotsHaveNoUnreachableVerdict(slot({
      offered: ['met', 'absent', 'unclear'], emits: ['met'],
      codes: { absent: 'D1', unclear: 'D1' },
    }));
    expect(f[0]).toContain('score-neutral by construction');
  });

  it('reports the map\'s ORIGINAL emits, not the expanded set', () => {
    const p = slot({ offered: ['met', 'x'], emits: ['met'] });
    p.divergences = [[['q'], ['met']]];
    const f = mappedSlotsHaveNoUnreachableVerdict(p);
    expect(f[0]).toContain("it produces ['met']");   // not ['met', 'q']
  });
});

describe('every_reference_has_the_data_that_resolves_it', () => {
  it('is silent on a file that carries references and declares its data', () => {
    expect(everyReferenceHasItsData({ files: [{
      path: 'psychology/h1.olx',
      text: '<!--\n---\ncorpus_data: ~/molly_data\n---\n-->\n{{corpus:Q1/p3:r:0:4:sha=aa}}',
    }] })).toEqual([]);
  });

  it('FIRES on a file that references without declaring, and counts them', () => {
    const f = everyReferenceHasItsData({ files: [{
      path: 'psychology/h9.olx',
      text: '{{corpus:Q1/p3:r:0:4:sha=aa}} and {{corpus:Q1/p4:r:0:4:sha=bb}}',
    }] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('carries 2 reference(s)');
    expect(f[0]).toContain('the whole build');
  });

  it('ignores a file with no references at all', () => {
    expect(everyReferenceHasItsData({ files: [{ path: 'x.olx', text: '<p>hi</p>' }] }))
      .toEqual([]);
  });

  // THE BUG THE PYTHON COPY ACTUALLY HAD: the frontmatter is wrapped in an HTML
  // comment, so a rule demanding a `---` fence at byte 0 rejects every real file.
  it('accepts frontmatter wrapped in an HTML comment, as every .olx here is', () => {
    expect(declaresCorpusData('<!--\n---\ncorpus_data: ~/molly_data\n---\n-->')).toBe(true);
  });

  it('only reads the head, as the build does', () => {
    const pad = 'x'.repeat(4100);
    expect(declaresCorpusData(pad + '\ncorpus_data: ~/molly_data\n')).toBe(false);
  });

  it('counts an unexpandable $VAR as DECLARED, since the line was there', () => {
    const before = process.env.E58_NOT_SET_VAR;
    delete process.env.E58_NOT_SET_VAR;
    try {
      expect(declaresCorpusData('corpus_data: $E58_NOT_SET_VAR/corpus\n')).toBe(true);
    } finally {
      if (before !== undefined) process.env.E58_NOT_SET_VAR = before;
    }
  });

  it('reports an empty scan as coverage of nothing, not as agreement', () => {
    const f = everyReferenceHasItsData({ files: [], root: '/tmp/none' });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('cannot be reported as agreement');
  });

  it('reports an unreadable file as unknown, not as clean', () => {
    const f = everyReferenceHasItsData({ files: [{ path: 'a.olx', error: 'EACCES' }] });
    expect(f[0]).toContain('cannot be read (EACCES)');
  });
});

describe('handsplit_rows_are_disjoint', () => {
  const T = (fields: Record<string, unknown>) =>
    ({ tables: [{ name: 'h2.json', rows: [{ pid: 3, fields }] }] });

  it('is silent when the boxes hold different sentences', () => {
    expect(handsplitRowsAreDisjoint(T({
      first: 'He left the room.', second: 'She stayed behind.',
    }))).toEqual([]);
  });

  // THE DAMAGING CASE: not a duplicate, but a box carrying its neighbour too.
  it('FIRES when one box is contained in another', () => {
    const f = handsplitRowsAreDisjoint(T({
      first: 'He left the room.',
      second: 'He left the room. She stayed behind.',
    }));
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('h2.json p3');
    expect(f[0]).toContain('`first` is contained in `second`');
  });

  it('folds a curly apostrophe, because the submissions carry both', () => {
    const f = handsplitRowsAreDisjoint(T({
      a: "he didn't stay", b: 'He didn\u2019t stay. Then he did.',
    }));
    expect(f).toHaveLength(1);
  });

  it('ignores trailing periods, case and whitespace', () => {
    const f = handsplitRowsAreDisjoint(T({
      a: '  He   LEFT the room  ', b: 'he left the room.',
    }));
    expect(f).toHaveLength(1);
  });

  it('skips empty boxes rather than calling them contained in everything', () => {
    expect(handsplitRowsAreDisjoint(T({
      a: '', b: 'He left.', c: '   ',
    }))).toEqual([]);
  });

  it('reports an unreadable table as a failure to judge', () => {
    const f = handsplitRowsAreDisjoint({
      tables: [{ name: 'h3.json', error: 'No such file' }],
    });
    expect(f).toEqual(['h3.json could not be read: No such file']);
  });

  it('orders rows by pid AS A STRING, so p10 precedes p9', () => {
    const f = handsplitRowsAreDisjoint({
      tables: [{ name: 'h.json', rows: [
        { pid: 9, fields: { a: 'x', b: 'x' } },
        { pid: 10, fields: { a: 'y', b: 'y' } },
      ] }],
    });
    expect(f[0]).toContain('p10');
    expect(f[1]).toContain('p9');
  });
});

describe('probe_unreachable_pairs_still_apply', () => {
  it('is silent while the probe still cannot reach the declared pair', () => {
    expect(probeUnreachablePairsStillApply({
      signatures: { Q4a: { charge_once: [['x', 'y']] } },
      declarations: [{ item: 'Q4a', pair: ['a', 'b'] }],
    })).toEqual([]);
  });

  // THE EXPIRY. Once the probe reaches it, the declaration is hiding a real
  // answer rather than a known blind spot.
  it('FIRES when the probe has grown to reach the pair', () => {
    const f = probeUnreachablePairsStillApply({
      signatures: { Q4a: { charge_once: [['a', 'b']] } },
      declarations: [{ item: 'Q4a', pair: ['a', 'b'] }],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('declared UNREACHABLE');
    expect(f[0]).toContain('the probe now finds it');
  });

  it('matches regardless of the order either side wrote the pair in', () => {
    const f = probeUnreachablePairsStillApply({
      signatures: { Q4a: { charge_once: [['b', 'a']] } },
      declarations: [{ item: 'Q4a', pair: ['a', 'b'] }],
    });
    expect(f).toHaveLength(1);
  });

  // `p & pair == pair`: a reached group that CONTAINS the declared pair counts.
  it('counts a larger reached group that contains the declared pair', () => {
    const f = probeUnreachablePairsStillApply({
      signatures: { Q4a: { charge_once: [['a', 'b', 'c'] as unknown as [string, string]] } },
      declarations: [{ item: 'Q4a', pair: ['a', 'b'] }],
    });
    expect(f).toHaveLength(1);
  });

  it('reports a missing signature as UNTESTABLE, not as still holding', () => {
    const f = probeUnreachablePairsStillApply({
      signatures: {},
      declarations: [{ item: 'Q4a', pair: ['a', 'b'] }],
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('no signature');
    expect(f[0]).toContain('cannot be re-tested');
  });

  it('orders by item, then by the sorted pair, as python does', () => {
    const f = probeUnreachablePairsStillApply({
      signatures: {},
      declarations: [
        { item: 'Q9', pair: ['a', 'b'] },
        { item: 'Q1', pair: ['z', 'y'] },
        { item: 'Q1', pair: ['a', 'b'] },
      ],
    });
    expect(f[0]).toContain('Q1: declared a probe-unreachable pair (a, b)');
    expect(f[1]).toContain('Q1: declared a probe-unreachable pair (y, z)');
    expect(f[2]).toContain('Q9');
  });
});

describe('prose_only_slots_are_declared', () => {
  const S = (x: [string, string][]) => x as Array<[string, string]>;

  it('is silent when the declaration matches the rubric and the budget', () => {
    expect(proseOnlySlotsAreDeclared({
      actual: S([['Q6', 'affect_c1']]), declared: S([['Q6', 'affect_c1']]), budget: 1,
    })).toEqual([]);
  });

  it('GATES a new prose-only rule that nobody declared', () => {
    const f = proseOnlySlotsAreDeclared({
      actual: S([['Q6', 'affect_c1']]), declared: S([]), budget: 0,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Q6.affect_c1 is judged by a per-slot');
  });

  // THE DIRECTION THAT GOES QUIET. A slot that became a primitive leaves its
  // declaration behind, and the stale entry is a hole in the gate.
  it('FIRES on a declaration the rubric no longer needs', () => {
    const f = proseOnlySlotsAreDeclared({
      actual: S([]), declared: S([['Q6', 'affect_c1']]), budget: 1,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('no longer carries a');
  });

  it('reports undeclared before stale before the budget, as python does', () => {
    const f = proseOnlySlotsAreDeclared({
      actual: S([['Q1', 'a']]), declared: S([['Q9', 'z']]), budget: 5,
    });
    expect(f).toHaveLength(3);
    expect(f[0]).toContain('Q1.a is judged');
    expect(f[1]).toContain('PROSE_ONLY_SLOTS names Q9.z');
    expect(f[2]).toContain('is down to 1 against a budget of 5');
  });

  it('sorts by item then slot, as python sorts tuples', () => {
    const f = proseOnlySlotsAreDeclared({
      actual: S([['Q2', 'b'], ['Q1', 'z'], ['Q1', 'a']]), declared: S([]), budget: 0,
    });
    expect(f[0]).toContain('Q1.a');
    expect(f[1]).toContain('Q1.z');
    expect(f[2]).toContain('Q2.b');
  });

  it('says the budget GREW when the surface expanded', () => {
    const f = proseOnlySlotsAreDeclared({
      actual: S([['Q1', 'a']]), declared: S([['Q1', 'a']]), budget: 0,
    });
    expect(f.join(' ')).toContain('grew to 1 against a budget of 0');
  });
});

describe('consensus_fixes_have_no_duplicate_cells', () => {
  it('is silent on a file with no repeated key', () => {
    expect(consensusDuplicates({ raw: '{\n "Q1/p3": 1,\n "Q1/p4": 2\n}' }))
      .toEqual([]);
  });

  // THE WHOLE POINT: the parsed object cannot show this, because the parser has
  // already thrown one of them away.
  it('FIRES on a key written twice, and names it', () => {
    const f = consensusDuplicates({ raw: '{\n "Q1/p3": 1,\n "Q1/p3": 2\n}' });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain("TWO entries for 'Q1/p3'");
  });

  it('proves the parser really does hide it', () => {
    expect(Object.keys(JSON.parse('{"a":1,"a":2}'))).toHaveLength(1);
  });

  it('reports invalid JSON as a failure to judge, not as clean', () => {
    const f = consensusDuplicates({ raw: '{not json', name: 'CONSENSUS_SPANS.json' });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('is not valid JSON');
  });

  // THE FALLBACK ARM. If the counts disagree while no repeat was named, a
  // duplicate is being discarded in a spelling the regex could not see, and
  // saying so beats reporting clean.
  it('says so when the counts disagree but it cannot name the duplicate', () => {
    const f = consensusDuplicates({ raw: '{"a": {"b": 1}}' });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('could not name it');
  });
});

describe('verdict_spaces_are_declared', () => {
  const slot = (web: string[], paper: string[]) =>
    ({ slots: [{ item: 'Q5', what: 'example_2', web, paper }],
       divergences: [] as Array<[string[], string[]]> });

  it('is silent when both sides offer the same verdicts', () => {
    expect(verdictSpacesAreDeclared(slot(['met', 'absent'], ['absent', 'met'])))
      .toEqual([]);
  });

  it('FIRES on an undeclared asymmetry, naming both directions', () => {
    const f = verdictSpacesAreDeclared(slot(['met', 'absent', 'unclear'], ['met', 'absent']));
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Q5.example_2');
    expect(f[0]).toContain("olx-only ['unclear']");
    expect(f[0]).toContain('paper-only []');
  });

  // DECLARED BY SHAPE, not by slot: one entry must cover every slot that
  // differs in exactly that way, which is the whole reason the table is small.
  it('respects a declared shape, and covers a second slot of the same shape', () => {
    const p = {
      slots: [
        { item: 'Q5', what: 'example_2', web: ['met', 'unclear'], paper: ['met'] },
        { item: 'Q6', what: 'affect_c1', web: ['absent', 'unclear'], paper: ['absent'] },
      ],
      divergences: [[['unclear'], []]] as Array<[string[], string[]]>,
    };
    expect(verdictSpacesAreDeclared(p)).toEqual([]);
  });

  it('stops covering a slot once the difference changes shape', () => {
    const p = {
      slots: [{ item: 'Q5', what: 'example_2', web: ['met', 'unclear', 'partial'], paper: ['met'] }],
      divergences: [[['unclear'], []]] as Array<[string[], string[]]>,
    };
    expect(verdictSpacesAreDeclared(p)).toHaveLength(1);
  });

  it('matches a declared shape regardless of the order it was written in', () => {
    const p = {
      slots: [{ item: 'Q1', what: 'k', web: [], paper: ['0', '1', '2'] }],
      divergences: [[[], ['2', '0', '1']]] as Array<[string[], string[]]>,
    };
    expect(verdictSpacesAreDeclared(p)).toEqual([]);
  });
});

describe('sibling_slots_share_their_structure', () => {
  const fam = (perItem: Record<string, { gates: boolean; at: number | null }>) => ({
    families: [{ family: 'h2-cadence-and-type', slot: 'names_behavior', perItem }],
    divergences: [] as Array<[string, string]>,
    budget: 0,
  });

  it('is silent when every sibling treats the slot alike', () => {
    expect(siblingSlotsShareTheirStructure(fam({
      PR: { gates: true, at: null }, NR: { gates: true, at: null },
      PP: { gates: true, at: null },
    }))).toEqual([]);
  });

  it('FIRES when one sibling gates and the others do not', () => {
    const f = siblingSlotsShareTheirStructure(fam({
      PR: { gates: true, at: null }, NR: { gates: true, at: null },
      PP: { gates: false, at: null },
    }));
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('`names_behavior` is not uniform');
    expect(f[0]).toContain('h2-cadence-and-type');
    // The majority shape comes first, which is what makes the odd one readable.
    expect(f[0].indexOf('gates on NR, PR')).toBeLessThan(f[0].indexOf('advisory on PP'));
  });

  it('renders a whole-numbered threshold as Python %g does, without a .0', () => {
    const f = siblingSlotsShareTheirStructure(fam({
      PR: { gates: true, at: 1 }, NR: { gates: true, at: 1 },
      PP: { gates: true, at: 0.5 },
    }));
    expect(f[0]).toContain('@1 on');
    expect(f[0]).toContain('@0.5 on');
    expect(f[0]).not.toContain('@1.0');
  });

  it('respects a declared divergence, and says nothing about it', () => {
    const p = fam({
      PR: { gates: true, at: null }, PP: { gates: false, at: null },
    });
    p.divergences = [['h2-cadence-and-type', 'names_behavior']];
    p.budget = 1;
    expect(siblingSlotsShareTheirStructure(p)).toEqual([]);
  });

  // THE RATCHET, both directions. A budget that only refuses growth lets a
  // resolved divergence leave its ceiling behind for a replacement to occupy.
  it('FIRES when a divergence was added beyond the budget', () => {
    const p = fam({ PR: { gates: true, at: null } });
    p.divergences = [['x', 'y']];
    p.budget = 0;
    const f = siblingSlotsShareTheirStructure(p);
    expect(f.join(' ')).toContain('holds 1 entrie(s) against a budget of 0');
  });

  it('FIRES when one was resolved and the ceiling was not lowered', () => {
    const p = fam({ PR: { gates: true, at: null } });
    p.budget = 2;
    const f = siblingSlotsShareTheirStructure(p);
    expect(f.join(' ')).toContain('is down to 0 entrie(s) against a budget of 2');
  });

  it('FIRES on a declaration the family has stopped needing', () => {
    const p = fam({
      PR: { gates: true, at: null }, PP: { gates: true, at: null },
    });
    p.divergences = [['h2-cadence-and-type', 'names_behavior']];
    p.budget = 1;
    const f = siblingSlotsShareTheirStructure(p);
    expect(f.join(' ')).toContain('but the family now agrees about it');
  });
});

describe('prompts_carry_no_process_history', () => {
  // THE ACCIDENT THAT MOTIVATED THE CHECK, as 2a actually shipped it.
  it('FIRES on a dated measurement in shipped guidance', () => {
    const f = processHistoryFindings([{
      key: '2a guidance',
      text: 'Charge the box only if it names a target. A rule that charged '
          + 'boxes of that shape was measured on 2026-09-02 and broke three '
          + 'cells the graders credit.',
    }]);
    expect(f.length).toBeGreaterThan(0);
    expect(f[0]).toContain('2a');
    expect(f.join(' ')).toContain('2026-09-02');
  });

  it('names the KIND, so the report says what sort of leak it is', () => {
    const f = processHistoryFindings([
      { key: 'Q1 rule', text: 'The sweep reverted this wording.' },
    ]);
    expect(f.join(' ')).toContain('our process vocabulary');
  });

  it('is silent on prose that only describes the task', () => {
    expect(processHistoryFindings([
      { key: 'Q1 rule', text: 'Credit a behaviour stated in observable terms.' },
    ])).toEqual([]);
  });

  // DEDUPLICATION IS THE CHECK'S OWN, not an accident of the corpus: a bullet
  // reaches this twice, once alone and once inside the assembled prompt, so
  // without the (item, kind, phrase) key every real accident reports twice.
  it('reports one accident once, even across two blocks of the same item', () => {
    const f = processHistoryFindings([
      { key: 'Q3 guidance', text: 'measured on 2026-09-02 here' },
      { key: 'Q3 prompt', text: 'and again measured on 2026-09-02 there' },
    ]);
    // Filtered to ONE kind on purpose: "measured on 2026-09-02" trips two
    // patterns at once -- the date and the report -- and python reports both,
    // because the dedup key is (item, KIND, phrase). Counting raw findings here
    // would assert away a behaviour the original has.
    expect(f.filter(x => x.includes('a dated measurement'))).toHaveLength(1);
  });

  it('keeps items separate, because two items can leak the same phrase', () => {
    const f = processHistoryFindings([
      { key: 'Q3 guidance', text: 'measured on 2026-09-02' },
      { key: 'Q4 guidance', text: 'measured on 2026-09-02' },
    ]);
    expect(f.filter(x => x.includes('a dated measurement'))).toHaveLength(2);
    expect(f.filter(x => x.startsWith('Q3'))).toHaveLength(2);
    expect(f.filter(x => x.startsWith('Q4'))).toHaveLength(2);
  });

  // `{phrase!r}` SWITCHES QUOTES when the phrase contains an apostrophe, and
  // this rule's last pattern is the one that can produce such a phrase.
  it("renders a phrase containing an apostrophe as Python's repr does", () => {
    const f = processHistoryFindings([
      { key: 'Q5 rule', text: "An earlier version of this rubric said otherwise." },
    ]);
    expect(f.join(' ')).toContain('this rubric said');
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
      ns: 'edu.no.such.course',
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('could not be read');
  });

  it('is silent on no artifacts at all', () => {
    expect(RULES.no_recorded_run_is_verdictless({ artifacts: [], ns: 'x' })).toEqual([]);
  });
});

describe('courseData', () => {
  it('refuses an unset course variable rather than defaulting', async () => {
    const { courseDir } = await import('./courseData');
    const saved = process.env.COURSE_METADATA;
    delete process.env.COURSE_METADATA;
    expect(() => courseDir('COURSE_METADATA', 'edu.no.such.course'))
      .toThrow(/is not set|declares no/);
    if (saved !== undefined) process.env.COURSE_METADATA = saved;
  });

  it('refuses to answer without naming a course', async () => {
    const { courseDir } = await import('./courseData');
    expect(() => courseDir('COURSE_DATA', '')).toThrow(/naming a course/);
  });

  it('derives the rubric and instrument ids by SHAPE from the rubric file', async () => {
    // THE TWO DIFFER, and that is the whole point of having both. The RUBRIC
    // is the component: `bmod_rubric.olx` -> `bmod_rubric`. The INSTRUMENT is
    // the family its handouts share: `bmod_handout1.olx` -> `bmod`.
    //
    // THEY WERE THE SAME STRING until 2026-09-26, both stripping `_rubric`, so
    // the two owners were indistinguishable by name and the store held
    // `rubrics/bmod` beside `instruments/bmod`. This assertion PINNED that,
    // which is why the split had to change the test as well as the code -- and
    // why the assertion is now that they DIFFER rather than what each is.
    const { scoringId } = await import('./courseData');
    const rubric = scoringId('edu.memphis.psych', 'rubric_id');
    const instrument = scoringId('edu.memphis.psych', 'instrument_id');
    expect(rubric).toBe('bmod_rubric');
    expect(instrument).toBe('bmod');
    expect(rubric).not.toBe(instrument);
  });

  it('falls back to the namespace it was ASKED about, never the active one', async () => {
    // python's equivalent fell back to the active course's namespace here and
    // gave a second course the first one's directory.
    const { scoringId } = await import('./courseData');
    expect(scoringId('edu.no.such.course', 'rubric_id')).toBe('edu.no.such.course');
  });

  it('files run output and gold with the RUBRIC, the corpus with the INSTRUMENT', async () => {
    // The split that stops a second rubric duplicating a corpus: write another
    // rubric for the same handout and only the first of these is new.
    const { outDir, rubricDir, instrumentDir } = await import('./courseData');
    const ns = 'edu.memphis.psych';
    expect(rubricDir(ns).endsWith('/rubrics/bmod_rubric')).toBe(true);
    expect(instrumentDir(ns).endsWith('/instruments/bmod')).toBe(true);
    expect(outDir(ns).endsWith('/rubrics/bmod_rubric/derived/out')).toBe(true);
    // AND THE TWO OWNERS ARE NOT THE SAME DIRECTORY, which is the property the
    // split exists for and which the old ids quietly denied.
    expect(rubricDir(ns)).not.toBe(instrumentDir(ns));
    expect(rubricDir(ns)).not.toBe(instrumentDir(ns));
  });

  it('no longer routes anything through the retired courses/<ns> layout', async () => {
    const { outDir, rubricDir, instrumentDir } = await import('./courseData');
    for (const p of [outDir('edu.memphis.psych'), rubricDir('edu.memphis.psych'),
                     instrumentDir('edu.memphis.psych')]) {
      expect(p).not.toContain('/courses/');
    }
  });

  it('refuses a path that escapes the course directory', async () => {
    const { readCourseJson } = await import('./courseData');
    process.env.COURSE_METADATA = '/tmp/enforce-test-root';
    expect(() => readCourseJson('COURSE_METADATA', '../../etc/passwd', 'edu.memphis.psych'))
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

describe('recorded_sides_are_readable', () => {
  it('FIRES when the artifact cannot be read', () => {
    const f = RULES.recorded_sides_are_readable({ sides: [
      { item: 'Q1', side: 'olx', numerator: 18, denominator: 20,
        out: 'gone', path: 'out/gone/Q1.runs.json' },
    ], ns: 'edu.no.such.course' });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('nothing wrong');
  });

  it('is silent on no recorded sides at all', () => {
    expect(RULES.recorded_sides_are_readable({ sides: [], ns: 'x' })).toEqual([]);
  });
});

describe('no_declaration_cites_a_suspect_cell', () => {
  // Handout 2's p2/p3: byte-identical transcriptions with different gold rows,
  // so at least one is mis-transcribed and neither can be leaned on.
  const base = {
    homeOf: { NR: 2, Q6: 1 },
    suspect: { '1': [], '2': [2, 3], '3': [] },
  };
  const run = (why: string, home = 'NR') =>
    noDeclarationCitesASuspectCell({
      ...base,
      entries: [{ table: 'forms.CORRECTED_GOLD', label: 'NR/p4', home, why }],
    });

  it('is silent on a declaration that cites nothing suspect', () => {
    expect(run('NR/p9 shows the same structural error, charged alike.')).toEqual([]);
  });

  it('fires on a declaration that argues from a suspect cell', () => {
    // The self-test's own injection: a live CORRECTED_GOLD entry starts citing
    // p3, and the check must report it.
    const out = run('The scorer agrees with NR/p3 on every pass.');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('argues from NR/p3');
    expect(out[0]).toContain('handouts.suspect(2)');
  });

  it('allows a sentence that names the cell AS suspect', () => {
    // The rule recorded rather than broken -- which this check's own docstring
    // does, so a scan without the exemption would report the documentation.
    expect(run('NR/p3 is suspect, which is why it is not the yardstick.'))
      .toEqual([]);
    expect(run('NR/p3 is excluded from scoring.')).toEqual([]);
  });

  it('scans per SENTENCE, so an exempt sentence does not cover its neighbour', () => {
    const out = run('NR/p2 is suspect. But NR/p3 still credits the answer.');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('NR/p3');
  });

  it('homes a bare participant number on the declaration it sits in', () => {
    // A reason about one cell says "p3" without repeating the item; reading
    // that as un-homed would miss the citations that matter most.
    expect(run('Gold credits p3 for the same wording.')).toHaveLength(1);
    expect(run('Gold credits p3 for the same wording.', 'Q6')).toEqual([]);
  });

  it('does not double-count a cell cited twice', () => {
    expect(run('NR/p3 agrees; NR/p3 agrees again.')).toHaveLength(1);
  });

  it('reads an empty payload as no findings', () => {
    expect(noDeclarationCitesASuspectCell({ entries: [], homeOf: {}, suspect: {} }))
      .toEqual([]);
  });
});

describe('shipped_text_matches_design', () => {
  const credit = {
    Q2: [{ what: 'reasons_given', attrs: { what: 'reasons_given',
                                           desc: 'HOW MANY of the listed statements.' } }],
  };
  const run = (want: string, field = 'desc', slot = 'reasons_given', item = 'Q2') =>
    shippedTextMatchesDesign({ designed: [{ item, slot, field, want }], credit });

  it('is silent when the shipped text IS the designed text', () => {
    expect(run('HOW MANY of the listed statements.')).toEqual([]);
  });

  it('FIRES when a slot ships text its subgoal did not design', () => {
    const out = run('HOW MANY of the LISTED statements.');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Q2/reasons_given.desc SHIPS text its subgoal did not design');
    // 'HOW MANY of the ' is 16 characters, so index 16 is the L/l.
    expect(out[0]).toContain('First divergence at char 16');
  });

  it('does not fire on re-wrapping', () => {
    // Where the line breaks fall is not the design; the prose is.
    expect(run('HOW   MANY of the\n\nlisted statements.')).toEqual([]);
    expect(run('  HOW MANY of the listed statements.  ')).toEqual([]);
  });

  it('passes over a design that is filed but NOT YET BUILT', () => {
    // Designs are registered before they ship, and after a revert the entry
    // keeps its text so the next attempt starts from the decision. A slot that
    // does not exist is not a fault; a slot that exists and says something
    // else is.
    expect(run('anything', 'rule_addition')).toEqual([]);   // no such field
    expect(run('anything', 'desc', 'no_such_slot')).toEqual([]);
    expect(run('anything', 'desc', 'reasons_given', 'NoSuchItem')).toEqual([]);
  });

  it('reports the divergence point at the END when one is a prefix', () => {
    const out = run('HOW MANY of the listed statements. And more.');
    expect(out).toHaveLength(1);
    // The shorter string runs out at 34; there is no differing character.
    expect(out[0]).toContain('First divergence at char 34');
  });

  it('reads an empty payload as no findings', () => {
    expect(shippedTextMatchesDesign({ designed: [], credit: {} })).toEqual([]);
  });
});

describe('every_prompt_field_is_designed', () => {
  const F = 'DESIGNED_TEXT_SHA.json';
  const run = (want: Record<string, string>, live: Record<string, string>) =>
    everyPromptFieldIsDesigned({ want, live, shaFile: F });
  const base = { 'Q2|reasons_given|desc': 'aaaaaaaaaaaa' };

  it('is silent when every shipped field matches its sha of record', () => {
    expect(run(base, base)).toEqual([]);
  });

  it('FIRES on a field whose text CHANGED without acceptance', () => {
    const out = run(base, { 'Q2|reasons_given|desc': 'bbbbbbbbbbbb' });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('CHANGED without acceptance: Q2/reasons_given/desc');
    // The message must carry the exact command that accepts it -- the file has
    // no bulk regenerate on purpose, so one-at-a-time has to be easy.
    expect(out[0]).toContain('--accept-design-change Q2 reasons_given desc');
  });

  it('FIRES on a shipped field with NO design of record', () => {
    const out = run({}, base);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('MISSING design of record: Q2/reasons_given/desc');
    expect(out[0]).toContain(F);
  });

  it('FIRES on a sha of record whose field is gone', () => {
    const out = run(base, {});
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('STALE design of record: Q2/reasons_given/desc');
  });

  it('reports the three kinds SEPARATELY, live ones first and each sorted', () => {
    // They mean different things: MISSING is a decision nobody recorded,
    // STALE is only paperwork. Collapsing them would hide that.
    const out = run({ 'B|s|desc': 'x', 'Gone|s|desc': 'y' },
                    { 'B|s|desc': 'CHANGED', 'A|s|rule': 'new' });
    expect(out.map(f => f.split(':')[0]))
      .toEqual(['MISSING design of record', 'CHANGED without acceptance',
                'STALE design of record']);
  });

  it('reads an empty payload as no findings', () => {
    expect(everyPromptFieldIsDesigned({ want: {}, live: {}, shaFile: F })).toEqual([]);
  });
});

describe('fails_verdict_is_mirrored_in_the_app', () => {
  // A minimal source carrying every part the check looks for.
  const OK = [
    'export function parseMaps(x) { return x; }',
    'export function mappedVerdict(x) { return x; }',
    'export function satisfiedMap(m) { for (const r of maps) {} }',
    'export function splitFailsVerdict(k) { return k.split("->"); }',
    'export function parseForbid(s) { return splitFailsVerdict(s); }',
    'export function parseExpect(s) { return splitFailsVerdict(s); }',
  ].join('\n');
  const run = (src: string) => runtimeParsesFailsVerdict({ name: 'slotSheet.ts', src });

  it('is silent when the runtime mirrors both primitives', () => {
    expect(run(OK)).toEqual([]);
  });

  it('FIRES when the runtime cannot parse the arrow at all', () => {
    // The arrow becomes part of the KEY, so nothing matches the slot, the
    // check is never computed and nothing reports it.
    const out = run(OK.split('splitFailsVerdict').join('SPLITTER'));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('has no splitFailsVerdict');
  });

  it('stops after the missing-splitter finding rather than repeating itself', () => {
    // Without the early return, every caller reports the same absence again.
    const gone = OK.split('splitFailsVerdict').join('SPLITTER');
    expect(run(gone).filter(f => f.includes('parseForbid'))).toEqual([]);
  });

  it('FIRES on a caller that parses the arrow but never splits it', () => {
    const out = run(OK.replace('export function parseForbid(s) { return splitFailsVerdict(s); }',
                               'export function parseForbid(s) { return s; }'));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('slotSheet.ts:parseForbid does not call splitFailsVerdict');
  });

  it('FIRES on each missing `maps` part separately', () => {
    expect(run(OK.replace('export function parseMaps(', 'export function parseMapsX('))[0])
      .toContain('has no parseMaps');
    expect(run(OK.replace('export function mappedVerdict(', 'export function mappedVerdictX('))[0])
      .toContain('has no mappedVerdict');
    expect(run(OK.replace('for (const r of maps)', 'for (const r of mapsX)'))[0])
      .toContain('does not apply `maps`');
  });

  it('reports an unreadable file as an empty source, not as a pass', () => {
    // '' has none of the parts, so it reports every one -- a file the
    // assembler could not read must not read as a clean mirror.
    expect(run('').length).toBeGreaterThan(0);
  });
});

describe('gold_columns_are_the_item_labels', () => {
  const labels = { '3': { '1a': '1a', '1b': '1b' } };
  const ok = { '3': { headings: ['1a Score', '1a Feedback', '1b Score', '1b Feedback'] } };

  it('is silent when every label has both of its columns', () => {
    expect(goldColumnsAreItemLabels({ labels, sheets: ok })).toEqual([]);
  });

  it('FIRES on a label the graders sheet has no column for', () => {
    // Edit a label for wording and the join breaks silently: the item simply
    // loads no score and no feedback.
    const out = goldColumnsAreItemLabels({
      labels: { '3': { RENAMED: '1a', '1b': '1b' } }, sheets: ok });
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("item '1a' is labelled 'RENAMED'");
    expect(out[0]).toContain("no 'RENAMED Score' column");
    expect(out[1]).toContain("no 'RENAMED Feedback' column");
  });

  it('reports Score and Feedback SEPARATELY', () => {
    const out = goldColumnsAreItemLabels({
      labels, sheets: { '3': { headings: ['1a Score', '1b Score', '1b Feedback'] } } });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("no '1a Feedback' column");
  });

  it('says a workbook it could not READ is unconfirmed, not passing', () => {
    // A check that cannot run is not the same as one that passes, and the two
    // must not print alike.
    const out = goldColumnsAreItemLabels({
      labels, sheets: { '3': { unreadable: 'workbook is locked' } } });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('cannot be read (workbook is locked)');
    expect(out[0]).toContain('not the same as one that passes');
  });

  it('treats a MISSING record the same way, not as a clean sheet', () => {
    const out = goldColumnsAreItemLabels({ labels, sheets: {} });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('no record of its columns');
  });

  it('distinguishes an EMPTY workbook from an unreadable one', () => {
    const out = goldColumnsAreItemLabels({ labels, sheets: { '3': { headings: [] } } });
    expect(out).toEqual(["h3: the graders' workbook has no rows at all"]);
  });

  it('reads an empty payload as no findings', () => {
    expect(goldColumnsAreItemLabels({ labels: {}, sheets: {} })).toEqual([]);
  });
});

describe('action_attributes_are_declared_in_the_block', () => {
  const SRC = [
    'export const LLMAction = {',
    '  attributes: z.object({',
    '    target: z_stateRef,',
    '    slots: z.string().optional(),',
    '    nested: z.object({',
    '      notAnAttribute: z.string(),',
    '    }),',
    '  }).strict(),',
    '};',
  ].join('\n');
  const run = (used: Record<string, string[]> | null, src = SRC) =>
    actionAttributesAreDeclared({ blockName: 'LLMAction.ts', blockSrc: src, used });

  it('is silent when every authored attribute is declared', () => {
    expect(run({ slots: ['a'], target: ['a'], id: ['a'] })).toEqual([]);
  });

  it('FIRES on an attribute the .strict() schema does not declare', () => {
    // The historical failure: `forbid` was implemented, parsed, declared in
    // primitives.json and unit-tested -- and never added to this schema, so
    // seven items became ErrorNodes and every cell timed out as `no-cell`.
    const out = run({ forbid: ['bmod_h1_q1_llm', 'bmod_h1_q2_llm'] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('<LLMAction forbid="..."> is authored on 2 action(s)');
    expect(out[0]).toContain('bmod_h1_q1_llm, bmod_h1_q2_llm');
    expect(out[0]).toContain('no-cell');
  });

  it('counts only the TOP level of the schema, not nested keys', () => {
    // A looser match would declare an attribute the block does not accept.
    expect(run({ notAnAttribute: ['a'] })).toHaveLength(1);
    expect(run({ nested: ['a'] })).toEqual([]);
  });

  it('treats id and target as declared even when the schema omits them', () => {
    expect(run({ id: ['a'], target: ['a'] }, 'attributes: z.object({\n}).strict()'))
      .toEqual([]);
  });

  it('names at most four sites but counts them all', () => {
    const out = run({ forbid: ['e', 'd', 'c', 'b', 'a'] });
    expect(out[0]).toContain('authored on 5 action(s)');
    expect(out[0]).toContain('(a, b, c, d)');
    expect(out[0]).not.toContain(', e)');
  });

  it('reports a schema it cannot FIND rather than passing', () => {
    const out = run({ slots: ['a'] }, 'export const LLMAction = {};');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('cannot find the');
  });

  it('is silent when lo-blocks is absent, which is not a finding', () => {
    expect(run(null)).toEqual([]);
  });
});

describe('olx_attributes_are_all_generated', () => {
  const known = ['slots', 'max'];
  const skip = ['id', 'target'];
  const item = (attrs: Array<[string, string]>, generated: Record<string, string | null>,
                errors?: Record<string, string>) =>
    ({ known, skip, items: [{ item: '3', attrs, generated, ...(errors ? { errors } : {}) }] });

  it('is silent when every authored attribute matches its generator', () => {
    expect(olxAttributesAreAllGenerated(
      item([['slots', 'a:A'], ['max', '6']], { slots: 'a:A', max: '6' }))).toEqual([]);
  });

  it('SEES camelCase attributes -- the hole the case class left open', () => {
    // `[a-z_]+` excluded every camelCase attribute from the check whose whole
    // purpose is catching one no generator produces. `showChecks` was
    // authored, unclaimed and invisible. Widened on BOTH sides together:
    // widening one would make them disagree about SCOPE while both reported
    // zero, which is worse than the hole.
    const out = olxAttributesAreAllGenerated(
      { known, skip, items: [{ item: '3', attrs: [['newFlag', 'true']], generated: {} }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('`newFlag=` is HAND-AUTHORED');
  });

  it('accepts an attribute DECLARED hand-authored', () => {
    const out = olxAttributesAreAllGenerated({
      known, skip, handAuthored: { showChecks: 'a display decision' },
      items: [{ item: '3', attrs: [['showChecks', 'false']], generated: {} }] });
    expect(out).toEqual([]);
  });

  it('refuses a hand-authored declaration that no longer applies', () => {
    // A declaration that has quietly stopped applying is one nobody removes.
    const out = olxAttributesAreAllGenerated({
      known, skip, handAuthored: { showChecks: 'a display decision' },
      items: [{ item: '3', attrs: [['slots', 'a:A']], generated: { slots: 'a:A' } }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('no longer authored on any sheet');
  });

  it('FIRES UNACCOUNTED on an attribute no generator claims', () => {
    // Hand-authored means some behaviour has no design of record: a regenerate
    // cannot reproduce it and no design change can express it.
    const out = olxAttributesAreAllGenerated(item([['bogus', 'x']], {}));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('`bogus=` is HAND-AUTHORED');
  });

  it('FIRES DIVERGED when a generator produces something else', () => {
    const out = olxAttributesAreAllGenerated(
      item([['slots', 'zz:Bogus']], { slots: 'a:A' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("the .olx has 'zz:Bogus' and the generator produces 'a:A'");
  });

  it('treats EMPTY and ABSENT alike, as python does', () => {
    // `(gen or None) != (have or None)`: an attribute the generator leaves
    // empty matches one the .olx spells as "".
    expect(olxAttributesAreAllGenerated(item([['slots', '']], { slots: null }))).toEqual([]);
    expect(olxAttributesAreAllGenerated(item([['slots', '']], { slots: '' }))).toEqual([]);
  });

  it('skips the STRUCTURAL attributes rather than reporting them', () => {
    expect(olxAttributesAreAllGenerated(
      item([['id', 'x'], ['target', 'y']], {}))).toEqual([]);
  });

  it('reports a generator that RAISED instead of comparing its output', () => {
    const out = olxAttributesAreAllGenerated(
      item([['slots', 'a:A']], { slots: null }, { slots: 'ValueError: nope' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toBe('3: the generator for `slots=` raised ValueError: nope');
  });

  it('reads an empty payload as no findings', () => {
    expect(olxAttributesAreAllGenerated({ known: [], skip: [], items: [] })).toEqual([]);
  });
});

describe('response_fixtures_are_intact', () => {
  const good = { items: [{ item: '1a', sha: 'aaa', computed: 'aaa',
                           cells: [{ pid: '1', sha: 'bbb', computed: 'bbb' }] }] };

  it('is silent when every sha still describes its boxes', () => {
    expect(responseFixturesAreIntact(good)).toEqual([]);
  });

  it('FIRES when a file sha no longer matches its cells', () => {
    const out = responseFixturesAreIntact({ items: [
      { ...good.items[0], computed: 'zzz' }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('records sha aaa and its cells now hash to zzz');
  });

  it('names the CELL, not just the file', () => {
    // A file-level sha moving says THAT something changed, never WHICH cell --
    // the difference between a diff someone reads and one they regenerate past.
    const out = responseFixturesAreIntact({ items: [
      { item: '1a', sha: 'aaa', computed: 'aaa',
        cells: [{ pid: '7', sha: 'bbb', computed: 'ccc' }] }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('1a/p7: recorded sha bbb, boxes hash to ccc');
  });

  it('FIRES on an item with no record at all', () => {
    // Otherwise it silently falls back to re-segmenting on every run, which is
    // the arrangement freezing replaced.
    const out = responseFixturesAreIntact({ items: [{ item: '2b', missing: true }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('no frozen reconstruction and no record of one');
  });

  it('reads an empty payload as no findings', () => {
    expect(responseFixturesAreIntact({ items: [] })).toEqual([]);
  });
});

describe('consensus_spans_are_disjoint', () => {
  const SAME = 'one clause doing both of these jobs at once';
  const cell = (boxes: Record<string, string>) =>
    ({ cells: [{ h: 1, item: 'Q6', pid: 1, boxes }], exclusions: {}, cover: {},
       backlog: [] as any, siblingRoles: [['state', 'affect'], ['state', 'change']] });

  it('is silent when no two boxes share a clause', () => {
    expect(consensusSpansAreDisjoint(cell({
      state_c1: 'the first consequence here', change_a1: 'a different clause entirely',
    }))).toEqual([]);
  });

  it('FIRES when two unrelated boxes hold the same text', () => {
    const out = consensusSpansAreDisjoint(cell({ change_a1: SAME, change_a2: SAME }));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('`change_a1` and `change_a2` hold the same text');
  });

  it('exempts a PAIRED pair, because sharing is the strategy there', () => {
    // state_cN names WHICH consequence, affect_cN what becomes of it; one
    // clause doing both jobs belongs in both boxes so each can be judged on it.
    expect(consensusSpansAreDisjoint(cell({ state_c1: SAME, affect_c1: SAME }))).toEqual([]);
  });

  it('takes the pairing from the DECLARATION, not from box names', () => {
    // The rule is generic; the vocabulary is the instrument's. A course that
    // declares nothing gets no exemption -- the safe direction.
    const p = cell({ state_c1: SAME, affect_c1: SAME });
    expect(consensusSpansAreDisjoint({ ...p, siblingRoles: [] })).toHaveLength(1);
    expect(consensusSpansAreDisjoint({
      cells: [{ h: 1, item: 'X', pid: 1, boxes: { cause_1: SAME, effect_1: SAME } }],
      exclusions: {}, cover: {}, backlog: [], siblingRoles: [['cause', 'effect']],
    })).toEqual([]);
  });

  it('exempts a COVER group, an overlap the sheet resolves', () => {
    const p = cell({ state_a1: SAME, state_a2: SAME });
    expect(consensusSpansAreDisjoint(p)).toHaveLength(1);
    expect(consensusSpansAreDisjoint({ ...p, cover: { Q6: [['state_a1', 'state_a2']] } }))
      .toEqual([]);
  });

  it('ignores overlaps under the 10-character floor', () => {
    expect(consensusSpansAreDisjoint(cell({ change_a1: 'short', change_a2: 'short' })))
      .toEqual([]);
  });

  it('skips an unscoreable cell, whose gold has been withdrawn', () => {
    const p = cell({ change_a1: SAME, change_a2: SAME });
    expect(consensusSpansAreDisjoint({
      ...p, exclusions: { '1|Q6': { '1': ['unscoreable', 'gold withdrawn'] } },
    })).toEqual([]);
  });

  it('refuses a backlog entry that no longer overlaps', () => {
    expect(consensusSpansAreDisjoint({
      ...cell({ change_a1: 'a', change_a2: 'b' }),
      backlog: [['Q6', 1, 'change_a1', 'change_a2', 'declared']],
    })[0]).toContain('which no longer overlaps');
  });
});

describe('fixture_agrees_with_gold', () => {
  const base = (boxes: Record<string, string>, fb: string) => ({
    cells: [{ h: 1, item: 'Q6', pid: 1, boxes }],
    feedback: { '1|1|Q6': fb },
    boxWords: { Q6: { state_c2: { want: ['second', 'consequence'], forbid: [] } } },
    overrides: {} as Record<string, string>,
  });

  it('is silent when a filled box matches a WRONG claim', () => {
    expect(fixtureAgreesWithGold(base(
      { state_c2: 'something written' },
      'the second consequence is not the same as the one you named'))).toEqual([]);
  });

  it('FIRES when a box is filled and gold says nothing was written', () => {
    const out = fixtureAgreesWithGold(base(
      { state_c2: 'something written' }, 'did not state a second consequence'));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('filled but gold says it was never written');
  });

  it('FIRES when a box is EMPTY and gold marked it wrong, not absent', () => {
    const out = fixtureAgreesWithGold(base(
      { state_c2: '' }, 'the second consequence is not the same as yours'));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('EMPTY but gold marked it wrong rather than absent');
  });

  it('reads "did not say HOW/WHY" as a judgement, not an absence', () => {
    // Those boxes rightly hold the text gold charges as insufficient.
    expect(fixtureAgreesWithGold(base(
      { state_c2: 'something written' },
      'did not say how the second consequence follows'))).toEqual([]);
  });

  it('requires an ABSENT claim to name the element in its OWN clause', () => {
    // Looking back into the previous sentence matched one cell's box against
    // "did not state a second consequence" because a word from the charge
    // before it happened to sit nearby.
    expect(fixtureAgreesWithGold(base(
      { state_c2: 'written' },
      'the second consequence was fine. did not state a reason'))).toEqual([]);
  });

  it('accepts a declared override and refuses a stale one', () => {
    const p = base({ state_c2: 'written' }, 'did not state a second consequence');
    expect(fixtureAgreesWithGold({ ...p, overrides: { 'Q6|1|state_c2': 'declared' } }))
      .toEqual([]);
    const clean = base({ state_c2: 'written' }, 'all good here');
    expect(fixtureAgreesWithGold({ ...clean, overrides: { 'Q6|1|state_c2': 'declared' } })[0])
      .toContain('which no longer disagrees');
  });

  it('falls back to the box name when an item declares no vocabulary', () => {
    expect(fixtureAgreesWithGold({
      cells: [{ h: 1, item: 'Q3', pid: 1, boxes: { realistic: 'written' } }],
      feedback: { '1|1|Q3': 'missing realistic' }, boxWords: {}, overrides: {},
    })).toHaveLength(1);
  });
});

describe('rule_examples_are_not_corpus', () => {
  const LEAK = 'i will put my phone in another room after nine every single night';
  const mk = (corpus: Record<string, Record<string, string>>, parts: string[],
              extra: Partial<any> = {}) => ({
    corpus, items: [{ h: 1, id: 'Q1', parts, question: '', excluded: [], ...extra }],
    backlog: [] as string[],
  });

  it('is silent when no prompt reproduces a student', () => {
    expect(ruleExamplesAreNotCorpus(mk(
      { Q1: { '10': LEAK } }, ['an invented example about something else entirely'])))
      .toEqual([]);
  });

  it('FIRES on a prompt that quotes a COUNTED student verbatim', () => {
    const out = ruleExamplesAreNotCorpus(mk({ Q1: { '10': LEAK } }, [LEAK]));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("reproduces p10's own words");
    expect(out[0]).toContain('still COUNTED on this item');
  });

  it('is silent when the student is not counted', () => {
    expect(ruleExamplesAreNotCorpus(
      mk({ Q1: { '10': LEAK } }, [LEAK], { excluded: [10] }))).toEqual([]);
  });

  it('ignores a run TWO students share -- that is how people write', () => {
    expect(ruleExamplesAreNotCorpus(mk(
      { Q1: { '10': LEAK, '11': LEAK } }, [LEAK]))).toEqual([]);
  });

  it('ignores the question echoed back', () => {
    // A student repeating the prompt is not us quoting the student.
    expect(ruleExamplesAreNotCorpus(
      mk({ Q1: { '10': LEAK } }, [LEAK], { question: LEAK }))).toEqual([]);
  });

  it('strips punctuation so a quoted example still matches', () => {
    // A worked example is written inside quotation marks -- that is what makes
    // it an example -- so its first and last tokens were `"i` and `night"`,
    // matching nothing. The check was close to blind to its own subject.
    expect(ruleExamplesAreNotCorpus(mk({ Q1: { '10': LEAK } }, [`"${LEAK}."`])))
      .toHaveLength(1);
    // The dash goes too: it is not in `[a-z0-9' ]`, so the em-dash is folded
    // to `-` and then stripped like any other mark. Only the apostrophe INSIDE
    // a word survives.
    expect(norm(`"Don't — do that,"`)).toBe("don't do that");
  });

  it('needs SIX words: a shorter coincidence is not a quotation', () => {
    expect(ruleExamplesAreNotCorpus(mk(
      { Q1: { '10': 'in another room after' } }, ['in another room after'])))
      .toEqual([]);
  });

  it('accepts a declared leak and refuses a stale entry', () => {
    const p = mk({ Q1: { '10': LEAK } }, [LEAK]);
    expect(ruleExamplesAreNotCorpus({ ...p, backlog: ['Q1|10'] })).toEqual([]);
    expect(ruleExamplesAreNotCorpus({
      ...mk({ Q1: { '10': LEAK } }, ['nothing in common here at all']),
      backlog: ['Q1|10'] })[0]).toContain('no longer reproduces');
  });

  it('is silent with no corpus, which is absence and not cleanliness', () => {
    expect(ruleExamplesAreNotCorpus(mk({}, [LEAK]))).toEqual([]);
  });
});

describe('records_carry_no_machine_path', () => {
  const rec = (doc: unknown) => ({ records: [{ label: 'course.json', doc }] });

  it('is silent on a record that names only root tokens', () => {
    expect(recordsCarryNoMachinePath(rec({
      jobs: { Q4b: { handsplit: '{instrument}/source/handsplit/Q4b.json' } },
    }))).toEqual([]);
  });

  it('FIRES on an absolute path in a VALUE', () => {
    // Fifteen of these sat in one record, every one broken by a root move,
    // with nothing reporting it: the file parsed and a reader that could not
    // find the artifact simply found none.
    const out = recordsCarryNoMachinePath(rec({
      probe: '/home/pdeane/molly_data/rubrics/bmod/derived/out/x.json' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('course.json.probe carries');
    expect(out[0]).toContain('must not name a directory on one machine');
  });

  it('ignores a path quoted in PROSE', () => {
    // The declarations quote paths when explaining an incident; rewriting one
    // would make the explanation describe something that never happened.
    for (const key of ['why', 'note', 'reason', 'feedback']) {
      expect(recordsCarryNoMachinePath(rec({
        [key]: 'we moved it out of /home/pdeane/molly_data/out last week',
      }))).toEqual([]);
    }
  });

  it('walks nested structures and names the path it found', () => {
    const out = recordsCarryNoMachinePath(rec({
      a: [{ b: { c: '/tmp/claude-1000/somewhere/deep.json' } }] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('course.json.a[0].b.c');
  });

  it('ignores a bare root prefix, which is not a location', () => {
    expect(recordsCarryNoMachinePath(rec({ prefix: '/home/' }))).toEqual([]);
  });

  it('reads an empty payload as no findings', () => {
    expect(recordsCarryNoMachinePath({ records: [] })).toEqual([]);
  });
});

describe('prose_only_claims_are_current', () => {
  const NOW = ['counts', 'cover', 'maps'];
  const base = {
    now: NOW, slots: ['1a|baseline_week'],
    judgedAgainst: { '1a|baseline_week': 'counts,cover,maps' },
  };

  it('is silent when every claim was judged against the CURRENT set', () => {
    expect(proseOnlyClaimsAreCurrent(base)).toEqual([]);
  });

  it('FIRES on a claim with no stamp at all', () => {
    // An undated claim cannot be re-tested when the primitive set grows.
    const out = proseOnlyClaimsAreCurrent({ ...base, judgedAgainst: {} });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("PROSE_ONLY_SLOTS['1a', 'baseline_week'] is declared NOT CONVERTIBLE");
  });

  it('FIRES on a stamp whose slot has left', () => {
    const out = proseOnlyClaimsAreCurrent({ ...base, slots: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('stamps a slot that is no longer');
  });

  it('FIRES when the registry has GROWN since the claim was judged', () => {
    // The claim may simply have stopped being true, and nothing about a stale
    // claim looks stale.
    const out = proseOnlyClaimsAreCurrent({
      ...base, judgedAgainst: { '1a|baseline_week': 'counts,cover' } });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('judged NOT CONVERTIBLE against {counts,cover}');
    expect(out[0]).toContain('the registry now also has `maps`');
    expect(out[0]).toContain('Still not convertible is a fine answer');
  });

  it('reports a primitive that has GONE as well as one added', () => {
    const out = proseOnlyClaimsAreCurrent({
      ...base, judgedAgainst: { '1a|baseline_week': 'counts,cover,retired' } });
    expect(out[0]).toContain('the registry now also has `maps`');
    expect(out[0]).toContain('no longer has `retired`');
  });

  it('reads an empty payload as no findings', () => {
    expect(proseOnlyClaimsAreCurrent({ now: [], slots: [], judgedAgainst: {} }))
      .toEqual([]);
  });
});

describe('primitive_conformance', () => {
  const OK = '## The checklist to return\n- `kept`\nDO NOT ANSWER `gone`.';
  const mk = (tag: string, prompt: string, extra: Partial<any> = {}) => ({
    excluding: ['counts', 'maps'],
    excludes: { counts: 'members', maps: 'key' } as Record<string, string | null>,
    tags: { Q6: tag }, inAction: ['Q6'], prompts: { Q6: prompt }, ...extra,
  });

  it('is silent when an excluded key is warned about and not listed', () => {
    expect(primitiveConformance(mk('<LLMAction maps="gone:x" />', OK))).toEqual([]);
  });

  it('FIRES when an excluded key is still listed in the checklist', () => {
    const out = primitiveConformance(mk('<LLMAction maps="kept:x" />', OK));
    expect(out.some(f => f.includes('`kept` is excluded from the schema but still'))).toBe(true);
  });

  it('FIRES when the prompt never says DO NOT ANSWER', () => {
    const out = primitiveConformance(mk('<LLMAction maps="gone:x" />',
      '## The checklist to return\n- `kept`\nplease answer `gone`.'));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('never tells the model not to answer it');
  });

  it('takes the MEMBERS for an attribute that excludes members', () => {
    // `counts` excludes the group's members, not the group's own name -- this
    // was `if attr === "counts"` in two files, and one copy drifted.
    const out = primitiveConformance(mk('<LLMAction counts="grp:gone,kept" />', OK));
    expect(out.some(f => f.includes('`kept` is excluded'))).toBe(true);
    expect(out.some(f => f.includes('`grp` is excluded'))).toBe(false);
  });

  it('skips an item with a sheet but NO judging prompt', () => {
    // A sheet-only item declares primitives and has no prompt to conform to.
    expect(primitiveConformance(mk('<DerivedChecks maps="gone:x" />', OK,
      { inAction: [], prompts: {} }))).toEqual([]);
  });

  it('ignores an attribute that does not exclude keys', () => {
    expect(primitiveConformance(mk('<LLMAction cover="kept:x" />', OK))).toEqual([]);
  });

  it('reads an empty payload as no findings', () => {
    expect(primitiveConformance({ excluding: [], excludes: {}, tags: {}, inAction: [], prompts: {} }))
      .toEqual([]);
  });
});

describe('response_boxes_are_bounded', () => {
  const OK = 'preamble\n## Student response to grade\n[box begins] a [box ends]\n'
           + '## End of the student response\nguidance the app appends';
  const one = (p: string) => responseBoxesAreBounded({ prompts: { '1a': p } });

  it('is silent when the boxes are opened, closed and the section ended', () => {
    expect(one(OK)).toEqual([]);
  });

  it('FIRES when the boxes are not delimited at all', () => {
    // An empty box renders as nothing, and the guidance the app appends lands
    // where its contents would be -- quoted back as the student's own words.
    const out = one(OK.split('[box begins]').join(''));
    expect(out.some(f => f.includes('boxes are not delimited'))).toBe(true);
  });

  it('FIRES on an unbalanced box', () => {
    const out = one(OK.replace('[box ends]', ''));
    expect(out[0]).toContain('1 `[box begins]` against 0 `[box ends]`');
    expect(out[0]).toContain('swallows whatever follows it');
  });

  it('FIRES when the response section is never closed', () => {
    const out = one(OK.replace('## End of the student response', ''));
    expect(out.some(f => f.includes('response section is not closed'))).toBe(true);
  });

  it('ignores a prompt with no response section -- it has no boxes to bound', () => {
    expect(one('a prompt that never shows the student anything')).toEqual([]);
  });

  it('counts only AFTER the response heading', () => {
    // A mention in the preamble is not a box.
    expect(one('[box begins] in the preamble\n' + OK)).toEqual([]);
  });

  it('reads an empty payload as no findings', () => {
    expect(responseBoxesAreBounded({ prompts: {} })).toEqual([]);
  });
});

describe('probeQuestion', () => {
  const PROMPT = [
    '## Credit components',
    '- `aimed`: the desc half, which also ships',
    '## The checklist to return',
    '- `aimed` -- `met`/`absent`: the rule half,',
    '  continued over a second line',
    '- `other` -- `met`/`absent`: something else',
    '## Next section',
  ].join('\n');

  it('reads an entry that runs over SEVERAL lines', () => {
    // Descs are written as prose and keep their newlines through the render.
    const e = checklistEntries(PROMPT);
    expect(e.aimed[0]).toBe('-- `met`/`absent`');
    expect(e.aimed[1]).toBe('the rule half,\n  continued over a second line');
  });

  it('returns BOTH halves for an asked slot, in prompt order', () => {
    // The desc renders under Credit components and the rule under the
    // checklist, in ONE prompt; reporting only the checklist half is how a
    // declared sentence read as "gone" while it was in front of the grader.
    const q = questionFor('WK2', 'aimed', { prompts: { WK2: PROMPT }, tags: {}, aliases: {} })!;
    expect(q.kind).toBe('asked');
    expect(q.question).toContain('the desc half');
    expect(q.question).toContain('the rule half');
  });

  it('falls through to the DETERMINISTIC rule when no LLM is asked', () => {
    // Not asked of an LLM is not the same as not measured -- refusing these
    // left 42 of 110 credit slots unprobeable.
    const tag = '<DerivedChecks slots="typed:Typed" derived="typed:present:src" />';
    const q = questionFor('T2', 'typed', { prompts: {}, tags: { T2: tag }, aliases: {} })!;
    expect(q.kind).toBe('derived');
    expect(q.question).toBe('derived="typed:present:src"');
    expect(q.how).toEqual(['derived']);
  });

  it('labels a derived slot by its EXACT name, not by an alias', () => {
    // An alias group is right for FINDING the clauses and wrong for labelling.
    const tag = '<DerivedChecks slots="other:Other|typed:Typed" expect="typed:x" />';
    expect(derivation('T2', 'typed', tag, ['typed', 'other'])!.head).toBe('typed:Typed');
  });

  it('returns null when nothing on the sheet answers the slot', () => {
    expect(questionFor('T2', 'ghost', { prompts: {}, tags: { T2: '<x/>' }, aliases: {} }))
      .toBeNull();
  });
});

describe('probe_receipts_match_shipping', () => {
  const PROMPT = '## The checklist to return\n- `aimed` -- `met`: the question';
  const base = { prompts: { WK2: PROMPT }, tags: {}, aliases: {}, refusals: {} };
  const sha = questionFor('WK2', 'aimed', base)!.sha;

  it('is silent when the receipt matches what ships', () => {
    expect(probeReceiptsMatchShipping({ ...base,
      receipts: [{ item: 'WK2', slot: 'aimed', sha }] })).toEqual([]);
  });

  it('FIRES when the shipped question has drifted since the probe', () => {
    // Probe on Monday, edit the desc on Tuesday, sweep on Wednesday citing
    // Monday's result -- the gap construction cannot close.
    const out = probeReceiptsMatchShipping({ ...base,
      receipts: [{ item: 'WK2', slot: 'aimed', sha: 'deadbeefcafe' }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain(`PROBED deadbeefcafe, SHIPS ${sha}`);
  });

  it('reports a receipt for a slot nothing asks any more', () => {
    const out = probeReceiptsMatchShipping({ ...base,
      receipts: [{ item: 'WK2', slot: 'gone', sha: 'x', verdict: 'PROCEED' }],
      refusals: { 'WK2|gone': 'WK2/gone is not in the shipped checklist.' } });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('a probe recorded verdict PROCEED');
    expect(out[0]).toContain('not evidence for the next attempt');
  });

  it('reads an empty payload as no findings', () => {
    expect(probeReceiptsMatchShipping({ prompts: {}, tags: {}, aliases: {}, receipts: [] }))
      .toEqual([]);
  });
});

describe('new_slots_were_probed', () => {
  const base = { asked: { Q1: ['a', 'b'] }, seen: { Q1: ['a', 'b'] }, probed: {} };

  it('is silent when the recording saw every answerable slot', () => {
    expect(newSlotsWereProbed(base)).toEqual([]);
  });

  it('FIRES on a slot never recorded and never probed', () => {
    // The vacuous-pass half: with no receipt there is nothing to compare, and
    // a clean receipt check reads exactly like a verified one.
    const out = newSlotsWereProbed({ ...base, seen: { Q1: ['a'] } });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Q1/b is an answerable slot the last recording never saw');
    expect(out[0]).toContain('~30 calls');
  });

  it('accepts a slot a probe already covers', () => {
    expect(newSlotsWereProbed({ ...base, seen: { Q1: ['a'] }, probed: { Q1: ['b'] } }))
      .toEqual([]);
  });

  it('skips an item with NOTHING recorded, rather than reporting every slot', () => {
    // Never measured is not the same as every slot being new, and reporting
    // them all would bury the one that matters.
    expect(newSlotsWereProbed({ asked: { Q1: ['a', 'b'] }, seen: { Q1: [] }, probed: {} }))
      .toEqual([]);
  });

  it('reads an empty payload as no findings', () => {
    expect(newSlotsWereProbed({ asked: {}, seen: {}, probed: {} })).toEqual([]);
  });
});

describe('written_rules_reach_the_shipped_prompt', () => {
  const LINE = 'a generated rule line long enough to count as prose, not markup';
  const base = {
    prompts: { Q1: `short\n${LINE}` },
    shipped: { Q1: `<olx>${LINE}</olx>` },
    recorded: ['Q1'],
  };

  it('is silent when every generated line reaches the handout', () => {
    expect(writtenRulesReachTheShippedPrompt(base)).toEqual([]);
  });

  it('FIRES when the shipped .olx has fallen behind the rubric', () => {
    const out = writtenRulesReachTheShippedPrompt({ ...base, shipped: { Q1: '<olx/>' } });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('generates 1 prompt line(s) the shipped .olx does not carry');
    expect(out[0]).toContain('recorded number describes a prompt the rubric has moved past');
  });

  it('ignores an item with no recorded number to invalidate', () => {
    expect(writtenRulesReachTheShippedPrompt({
      ...base, shipped: { Q1: '<olx/>' }, recorded: [] })).toEqual([]);
  });

  it('ignores short lines and <Ref>, whose text the server substitutes', () => {
    expect(writtenRulesReachTheShippedPrompt({
      prompts: { Q1: 'short line\n<Ref target="x"> ' + LINE },
      shipped: { Q1: '<olx/>' }, recorded: ['Q1'] })).toEqual([]);
  });

  it('reads an empty payload as no findings', () => {
    expect(writtenRulesReachTheShippedPrompt({ prompts: {}, shipped: {}, recorded: [] }))
      .toEqual([]);
  });
});
