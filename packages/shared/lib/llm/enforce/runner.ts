// The one entry point python calls. `lo_enforce.py` is its only caller.
//
// Reads `{"check": <name>, "payload": ...}` or `{"probe": <name>, "payload": ...}`
// on stdin and writes `{"findings": [...]}`, `{"result": ...}` or
// `{"error": "..."}` on stdout. Stdin rather than argv because a payload can
// carry every shipped prompt in the corpus, or the whole reference corpus, and
// a check that silently truncates its input reports clean for the wrong reason.

import { mountedCourses } from './courseData';
import { PROBES, RULES } from './index';
import { NATIVE } from './native';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

// RULES WHOSE NATIVE ASSEMBLER IS PROVEN TO BUILD PYTHON'S PAYLOAD.
//
// Subgoal E63. The runner can assemble its own payload -- that is the point of
// the goal, because it lets a ported check's python side shrink to one line --
// but it may only do so for a rule where the assembler has been SHOWN to build
// what python builds. Measured 2026-09-25, comparing every assembler's output
// against the payload python actually sends:
//
//     10 identical        <- after two assembler bugs were fixed
//     4  identical once ordering is normalised
//     7  GENUINELY DIFFERENT -- same keys, different data
//     4  no assembler at all
//
// ORDER-ONLY IS NOT ENOUGH, and four names were removed from this list for
// falling short of it. "The findings agree" proved nothing: EVERY rule returns
// [] on today's data, so both sides agreed by being empty -- the same
// both-read-zero trap this package keeps relearning. A mutation that would make
// the rules FIRE could not be constructed generically, so order-insensitivity
// is UNPROVEN and those rules keep their python fetch until it is proven.
// `gold_tables_have_no_duplicate_keys` was removed for a plainer reason: it is
// not a rule in RULES at all.
//
// SO THIS IS AN ALLOWLIST, NOT A FLAG. Self-assembling the nine that differ
// would feed the rule other data than the audit feeds it, and every one of
// them would still "agree" with python -- which is the exact failure goal K
// already hit when three assemblers returned empty and agreed with zero. The
// nine are named in the goal entry as the work that earns them a place here.
//
// IT RATCHETS UPWARD ONLY BY MEASUREMENT: a name is added when the comparison
// test says its payload equals python's, never because it looks right.
export const SELF_ASSEMBLING: ReadonlySet<string> = new Set([
  // PORTED AND CLEARED 2026-09-28. Both projections were compared against THE
  // PAYLOAD PYTHON ACTUALLY SENDS, captured by wrapping the bridge: 23 rows,
  // identical `sheetKeys` and `rubricDef` on every one, and the rubric side
  // identical to `rubric_component.load()`'s keys across all 26 items.
  // PROVEN ON FIRING DATA, not just at rest: with one `<Slot>` removed from a
  // COPY of the staged rubric, both readers moved the same way and the rule
  // produced exactly one finding naming the dropped key. Agreement at zero was
  // never the evidence.
  'sheet_matches_rubric',
  // PORTED 2026-09-27, self-assembling from the start: python hands no payload
  // because there is nothing for it to hand. The rule asks where three files
  // are -- the generic half beside these rules, the course half under the
  // rubric, the composed copy readers open -- and the assembler answers from
  // the tree. A payload from python would be python's view of the same
  // filesystem, which is a second reading, not a check.
  'every_document_is_where_its_readers_look',
  // Same reason: the assembler reads both halves off the tree.
  'no_composed_document_repeats_itself',
  // Same again: the three texts come off the tree, not from python.
  'composed_documents_are_current',
  // The rubric, the handouts and the course file are all on the tree.
  //
  // NATIVE-ONLY, AND PYTHON MUST PASS A PAYLOAD. Being on this list means the
  // runner CAN build this rule's payload, not that every caller should let it.
  // `enforcement.check_derived_fields_resolve` asked with `null` and the
  // assembler read `refs` from the course record ON DISK -- while the
  // enforcement self-test injects by popping a field from
  // `agreement.BLOCKS[...]["refs"]` IN MEMORY. The mutation was invisible, the
  // rule answered clean, and the case reported NOTHING FIRED (2026-09-27).
  // Python assembles and passes now; this entry stays so `auditContent.ts`,
  // which has no python to ask, keeps the rule at build time.
  // ADDED 2026-09-27, when the RUN ARCHIVE reader moved here. Its payload was
  // python's for one reason -- python held the only reader -- and the archive
  // is JSON on disk. PROVEN, not assumed: the native assembler builds the same
  // 26 rows python passes, field for field, which is what earns a place here.
  'web_code_is_stamped',
  // ADDED 2026-09-27. Its first native walk found HALF the artifacts, because
  // it globbed one level -- the same bug `_runs_files` was written to end, and
  // the one that once made a correctly-stamped sweep of all 26 items invisible.
  // The walker covers both layouts now, and the payload is identical over all
  // 104 artifacts.
  'count_scaffolds_are_arithmetic',
  'derived_fields_resolve',
  'ref_targets_resolve',
  'no_recorded_run_is_an_api_error',
  'citation_necessity_is_recorded',
  'convertible_prose_rules_have_subgoals',
  'consensus_fixes_have_no_duplicate_cells',
  // ADDED AFTER RECONCILIATION, 2026-09-25. Six became payload-IDENTICAL once
  // three assembler defects were fixed -- two writing `handout: null`, one
  // emitting `{cell:[item,pid]}` for a rule that reads `.item`/`.pid` -- and
  // one carrying a `count` key no rule reads. Two more are order-only and
  // proven on firing data with targeted mutations.
  // Became identical when PYTHON changed: it was sending the replacement
  // SPAN of each fix -- student sentences the rule never reads -- and now sends
  // only the kind and the box. 13 KB of student writing per audit stopped
  // crossing the bridge as a side effect of making the two payloads agree.
  'consensus_fixes_are_unique',
  // The ASSEMBLER was the better side here. Python sent `offered: null` for
  // a slot whose sheet offers only met/absent, because its helper returned an
  // empty set both for 'not found' and for 'offers nothing extra' -- and the
  // rule falls back to the RUBRIC's list on null, which subgoal E52 records as
  // having let a fault survive a whole sweep. Python now distinguishes the two.
  'mapped_slots_have_no_unreachable_verdict',
  // PROMPT SOURCE DIFFERS BY DESIGN and the rules do not care. Python REBUILDS
  // the prompt; the assembler reads the SHIPPED body from the .olx, so the two
  // differ in reference rendering (REF:id:target against <Ref id=.../>) and
  // leading whitespace. Proven immaterial on firing data: planting a case name
  // in every prompt gives 23 findings on both sides, same set; wiping one
  // designed entry's prompt at a time agrees on all four.
  'every_designed_entry_ships',
  'no_case_names_in_prompts',
  // WAS `NATIVE_BLOCKED`, and the blocker had gone stale: it said porting the
  // verdict vocabulary would make a THIRD copy, which stopped being true when
  // `verdictVocabulary.ts` became the single source and python started
  // reading it. Order-only against python's payload -- 217 slots, same set --
  // and proven on firing data: an unoffered verdict planted in every note
  // gives 213 findings on both sides, identical.
  'prompt_prose_names_only_offered_verdicts',
  // WAS `NATIVE_BLOCKED` on effort, not possibility: two of its three inputs
  // were already reachable (families from the rubric's `<Item family=...>`,
  // the budget from course.json) and the third was a python literal, which
  // E63 moved to the course file. Payload IDENTICAL on the first attempt --
  // budget, divergences and families all -- and fired identically when one
  // item's gate is flipped, the control the original port used.
  'sibling_slots_share_their_structure',
  // Payload IDENTICAL to python's, and byte-identical findings on two firing
  // controls: an orphan code and a ghost declaration, 18 findings each.
  'codes_reachable',
  // Payload identical to python's and findings identical on two firing
  // controls -- a counted family un-counted, and a counted family given a
  // second code -- 4 findings each.
  'countable_families_converted',
  'exclusion_claims_are_data',
  // Payload built from the collection's manifest, which now DECLARES the
  // filenames python used to default to. Same four wanted links; removing one
  // produces the same finding.
  'the_course_links_the_rubric_and_every_form',
  // Payload identical after two fixes the comparison forced: the corrections
  // and items are now sorted as python sorts them, and `pts=""` parses to null
  // rather than 0. Findings identical on an off-grid control, 15 each.
  'gold_corrections_land_on_attainable_scores',
  'carried_notes_are_intact',
  'slot_codes_exist',
  'no_unresolved_reference_reaches_the_page',
  'one_writer_per_computed_key',
  'verdict_vocabularies_correspond',
  'every_failing_verdict_has_a_charge',
  'pick_choices_match_rubric',
  'olx_corpus_references',
  'rubric_slots_reach_the_sheet',
  'sheet_slots_reach_the_rubric',
  'the_expanded_rubric_is_current',
  'slot_rules_are_vocabulary_neutral',
  'prompt_deviation_tables_are_current',
  'gold_scores_are_attainable',
  'gold_tables_have_no_duplicate_keys',
  'corrected_gold_matches_the_sheet',
  'enumerated_slots_cover_the_rubric',
  'citations_match_exclusions',
  'no_declaration_cites_a_suspect_cell',
  'shipped_text_matches_design',
  'every_prompt_field_is_designed',
  'fails_verdict_is_mirrored_in_the_app',
  'gold_columns_are_the_item_labels',
  'action_attributes_are_declared_in_the_block',
  'olx_attributes_are_all_generated',
  'response_fixtures_are_intact',
  'consensus_spans_are_disjoint',
  'fixture_agrees_with_gold',
  'rule_examples_are_not_corpus',
  'records_carry_no_machine_path',
  'prose_only_claims_are_current',
  'primitive_conformance',
  'response_boxes_are_bounded',
  'probe_receipts_match_shipping',
  'new_slots_were_probed',
  'written_rules_reach_the_shipped_prompt',
  // 146 fields, payload identical. Every one of the pattern's nine
  // alternatives fires, and 'worth 3 of 5' -- the SCALE, not a cost -- is
  // correctly spared by the lookahead. Finding text identical on two planted
  // cases.
  'no_judging_field_states_what_a_verdict_costs',
  // Findings identical where they render. The one divergence is deliberate
  // and corrective: python's message hardcoded "the other 145" from a file that
  // now holds 146 fields, and the assembler derives the count instead. The
  // message renders only for a receipt whose text is unrecorded -- none is --
  // so nothing observable moves.
  'probed_fields_keep_their_text',
  'computed_rules_do_not_share_a_key',
  'handsplit_rows_are_disjoint',
  'maps_tables_are_attached',
  'no_cell_is_both_corrected_and_declared',
  'no_recorded_run_is_verdictless',
  'parked_entries_still_apply',
  'prompts_carry_no_process_history',
  'verdict_spaces_are_declared',
  // ORDER-ONLY, AND PROVEN SO ON DATA THAT FIRES. Their payloads differ from
  // python's only in the order of a top-level collection. That was NOT enough
  // on its own -- every rule returns [] on today's data, so "the findings
  // agree" is two empties agreeing. Each was therefore mutated until it
  // produced findings (1, 7 and up to 28 of them) and the collection
  // permuted: the finding SET is unchanged in every firing case.
  //
  // THE FIRST ATTEMPT AT THIS PROOF WAS WRONG and is worth recording: it
  // reversed NESTED arrays too, which turned the pair ['Q6','link_c2'] into
  // ['link_c2','Q6'] and reported order-sensitivity that was the test's own
  // corruption. A nested array here is a TUPLE, not a set.
  'every_reference_has_the_data_that_resolves_it',
  'named_fixtures_still_name_something',
  'prose_only_slots_are_declared',
  'every_item_has_a_findable_slot_sheet',
  'gold_shared_prose_has_not_drifted',
  'recorded_sides_are_readable',
  'rubric_items_are_unique',
]);

/** One request answered. Never throws: a batch must not lose its other members. */
function answer(req: {
  check?: string; probe?: string; payload?: unknown; ns?: string;
}) {
  const kind = req.probe ? 'probe' : 'check';
  const name = String(req.probe ?? req.check);
  const fn = kind === 'probe' ? PROBES[name] : RULES[name];
  if (!fn) {
    const offered = kind === 'probe' ? Object.keys(PROBES) : Object.keys(RULES);
    return {
      error: `no ${kind} named ${JSON.stringify(name)}; this package offers ` +
             `${JSON.stringify(offered.sort())}`,
    };
  }
  let payload = req.payload;
  // NO PAYLOAD MEANS "ASSEMBLE IT YOURSELF", which is what lets a caller --
  // python or otherwise -- ask for a rule without knowing how to feed it.
  if (kind === 'check' && (payload === undefined || payload === null)) {
    if (!SELF_ASSEMBLING.has(name)) {
      return {
        error: `${name} was asked with no payload and is not in ` +
               `SELF_ASSEMBLING: its native assembler has not been shown to ` +
               `build the payload python builds, so assembling here would feed ` +
               `the rule different data and it would agree for the wrong reason`,
      };
    }
    const asm = NATIVE[name];
    if (!asm) {
      return { error: `${name} is in SELF_ASSEMBLING and has no assembler in NATIVE` };
    }
    const ns = req.ns ?? soleMountedCourse();
    if (!ns) {
      return {
        error: `${name} was asked with no payload and no course: name one with ` +
               `"ns", or mount exactly one course so it can be inferred`,
      };
    }
    try {
      payload = asm(ns);
    } catch (e) {
      return { error: `${name}'s assembler threw: ${String(e)}` };
    }
  }
  try {
    const got = fn(payload);
    return kind === 'probe' ? { result: got } : { findings: got };
  } catch (e) {
    return { error: `${name} threw: ${String(e)}` };
  }
}

/** The one mounted course, or null when there is not exactly one. */
function soleMountedCourse(): string | null {
  const all = mountedCourses();
  return all.length === 1 ? all[0] : null;
}

/**
 * SERVE MODE: one process, a request per line, for as long as the caller wants.
 *
 * WHY IT EXISTS. Starting tsx costs ~1.6s and the audit asks one rule at a
 * time, so every rule goal K ports added that much to EVERY audit -- and the
 * selftest runs the whole audit once per injection case, so the cost is
 * multiplied by nineteen. Measured 2026-09-25 at eighteen ported checks: ~9
 * minutes of the selftest was process startup, and the run was killed by a
 * ceiling set before the ports existed. A goal that makes the audit's own
 * verification unaffordable is defeating itself.
 *
 * `batch` already paid the cost once per BATCH, but the audit cannot batch: each
 * check is a separate python function that the audit calls on its own. Serve
 * mode pays it once per PROCESS instead, and needs no caller to change shape.
 *
 * NEWLINE-DELIMITED, one answer per request, in order. Answers never throw --
 * `answer` already guarantees that -- so a bad request cannot end the session
 * and strand the requests behind it.
 */
async function serve() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let req: { check?: string; probe?: string; payload?: unknown; batch?: any[] };
      try {
        req = JSON.parse(line);
      } catch (e) {
        process.stdout.write(JSON.stringify({ error: `unreadable request: ${String(e)}` }) + '\n');
        continue;
      }
      const out = Array.isArray(req.batch)
        ? { batch: req.batch.map(answer) }
        : answer(req);
      process.stdout.write(JSON.stringify(out) + '\n');
    }
  }
}

async function main() {
  if (process.argv.includes('--serve')) {
    await serve();
    return;
  }
  let req: { check?: string; probe?: string; payload?: unknown; batch?: any[] };
  try {
    req = JSON.parse(await readStdin());
  } catch (e) {
    console.log(JSON.stringify({ error: `unreadable request: ${String(e)}` }));
    return;
  }
  // ONE PROCESS, MANY QUESTIONS. Starting tsx costs ~1.4s and the audit calls
  // one rule at a time, so every rule K ports adds that much to every audit.
  // A batch pays it once. Each member is answered independently and in order --
  // a rule that throws must not cost the batch its other answers.
  if (Array.isArray(req.batch)) {
    console.log(JSON.stringify({ batch: req.batch.map(answer) }));
    return;
  }
  // NAMED, NOT GUESSED. An unknown name is a wiring fault in the python caller;
  // answering it with an empty finding list would report the check as passing
  // when it never ran at all.
  console.log(JSON.stringify(answer(req)));
}

void main();
