// The enforcement rules and probes lo-blocks owns, by name.
//
// GOAL K. 171 live checks in `edu.memphis.psych/scoring/enforcement.py` ask
// questions of five different subjects — what was MEASURED, what OUR PYTHON
// does, what our DECLARATION TABLES claim, what our DOCUMENTS say, and what the
// CONTENT says. Only the last can live here, and for those the python check
// should be the part that fetches and reports while the JUDGEMENT is a function
// in this package — testable by vitest against its own fixtures, and next to
// the code it is judging.
//
// TWO REGISTRIES, BECAUSE THEY ANSWER DIFFERENTLY. A RULE returns FINDINGS and
// an empty list means the rule holds. A PROBE returns this implementation's
// ANSWER, for a python caller comparing it against python's own; an empty list
// from a probe means it produced nothing, which is a failure. Collapsing them
// into one registry would let a dead probe report as a passing rule.
//
// python names a rule or probe by string and cannot reach an arbitrary export.

import { EXTRA_VERDICTS } from '../slotSheet';
import { KNOWN_VERDICTS, RUBRIC_EXTRAS, VERDICT_HEDGES } from './verdictVocabulary';
import { caseNamesInPrompts } from './caseNames';
import { processHistoryFindings } from './processHistory';
import { siblingSlotsShareTheirStructure } from './siblingSlots';
import { verdictSpacesAreDeclared } from './verdictSpaces';
import { consensusDuplicates } from './consensusDuplicates';
import { proseOnlySlotsAreDeclared } from './proseOnlySlots';
import { probeUnreachablePairsStillApply } from './probeUnreachable';
import { handsplitRowsAreDisjoint } from './handsplitDisjoint';
import { everyReferenceHasItsData } from './referenceData';
import { mappedSlotsHaveNoUnreachableVerdict } from './mappedVerdicts';
import { goldSharedProseHasNotDrifted } from './goldSharedProse';
import { computedRulesDoNotShareAKey } from './computedKeys';
import { promptProseNamesOnlyOfferedVerdicts } from './offeredVerdicts';
import { parseSlotSpecs, resolveCorpusRefs } from './probes';
import { consensusFixesAreUnique, namedFixturesStillNameSomething } from './declarations';
import { codesReachable } from './codesReachable';
import { probedFieldsKeepTheirText } from './probedFields';
import { noJudgingFieldStatesCost } from './verdictCosts';
import { goldCorrectionsAreAttainable } from './goldAttainable';
import { carriedNotesAreIntact } from './carriedNotes';
import { slotCodesExist } from './slotCodes';
import { noUnresolvedReferenceReachesThePage } from './builtPageReferences';
import { oneWriterPerComputedKey } from './oneWriterPerKey';
import { verdictVocabulariesCorrespond } from './verdictVocabulariesCorrespond';
import { everyFailingVerdictHasACharge } from './failingVerdictCharge';
import { pickChoicesMatchRubric } from './pickChoicesMatchRubric';
import { olxCorpusReferences } from './olxCorpusReferences';
import { rubricSlotsReachTheSheet } from './rubricSlotsReachSheet';
import { sheetSlotsReachTheRubric } from './sheetSlotsReachRubric';
import { expandedRubricIsCurrent } from './expandedRubricCurrent';
import { slotRulesAreVocabularyNeutral } from './slotRuleVocabulary';
import { promptDeviationTablesAreCurrent } from './promptDeviations';
import { goldScoresAreAttainable } from './goldScoresAttainable';
import { goldTablesHaveNoDuplicateKeys } from './goldDuplicateKeys';
import { correctedGoldMatchesTheSheet } from './correctedGoldMatchesSheet';
import { enumeratedSlotsCoverTheRubric } from './enumeratedSlotsCover';
import { citationsMatchExclusions } from './citationsMatchExclusions';
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
import { ruleExamplesAreNotCorpus } from './ruleExamplesNotCorpus';
import { recordsCarryNoMachinePath } from './recordsCarryNoMachinePath';
import { proseOnlyClaimsAreCurrent } from './proseOnlyClaimsCurrent';
import { primitiveConformance } from './primitiveConformance';
import { responseBoxesAreBounded } from './responseBoxesBounded';
import { probeReceiptsMatchShipping } from './probeReceiptsShipping';
import { newSlotsWereProbed } from './newSlotsProbed';
import { writtenRulesReachTheShippedPrompt } from './writtenRulesShipped';
import { courseLinksEveryForm } from './courseLinks';
import { exclusionClaimsAreData } from './exclusionClaims';
import { countableFamiliesConverted } from './countableFamilies';
import { rubricItemsAreUnique } from './rubricItemsUnique';
import { everyDesignedEntryShips, handAuthoredAttrsStillSuppressSomething }
  from './designedText';
import { cellsBothCorrectedAndDeclared } from './goldTables';
import { mapsTablesAreAttached } from './mapsAttached';
import { parkedEntriesStillApply } from './parked';
import { ratchetsOnlyTighten } from './ratchet';
import { recordedSidesAreReadable } from './recordedSides';
import { verdictlessRuns } from './recordedRuns';
import { everyItemHasAFindableSlotSheet, generatedAttributesHaveADeclaration }
  from './sheetDiscovery';
import { scoreRecordedSheets } from './rescore';
import { NATIVE } from './native';
import { documentsWhereReadersLook } from './documentsWhereReadersLook';
import { documentSentencesDuplicated } from './documentSentencesDuplicated';
import { composedDocumentsCurrent } from './composedDocumentsCurrent';
import { derivedFieldsResolve } from './derivedFieldsResolve';
import { refTargetsResolve } from './refTargetsResolve';
import { recordedRunApiError } from './recordedRunApiError';
import { paperPromptBoxDeixis } from './paperPromptBoxDeixis';
import { countScaffoldArithmetic } from './countScaffoldArithmetic';
import { citationNecessityRecorded } from './citationNecessityRecorded';
import { convertibleProseHasSubgoal } from './convertibleProseHasSubgoal';
import { SPLIT_DOCUMENTS, NO_COURSE_HALF as NO_COURSE_HALF_DECL } from './splitDocuments';

export type Finding = string;
export type Rule = (payload: any) => Finding[];
export type Probe = (payload: any) => unknown;

export const RULES: Record<string, Rule> = {
  no_case_names_in_prompts: (p) => caseNamesInPrompts(p?.prompts ?? []),
  prompts_carry_no_process_history: (p) =>
    processHistoryFindings(p?.blocks ?? []),
  sibling_slots_share_their_structure: (p) =>
    siblingSlotsShareTheirStructure(p ?? { families: [], divergences: [], budget: 0 }),
  verdict_spaces_are_declared: (p) =>
    verdictSpacesAreDeclared(p ?? { slots: [], divergences: [] }),
  consensus_fixes_have_no_duplicate_cells: (p) =>
    consensusDuplicates(p ?? { raw: '' }),
  prose_only_slots_are_declared: (p) =>
    proseOnlySlotsAreDeclared(p ?? { actual: [], declared: [], budget: 0 }),
  probe_unreachable_pairs_still_apply: (p) =>
    probeUnreachablePairsStillApply(p ?? { signatures: {}, declarations: [] }),
  handsplit_rows_are_disjoint: (p) =>
    handsplitRowsAreDisjoint(p ?? { tables: [] }),
  every_reference_has_the_data_that_resolves_it: (p) =>
    everyReferenceHasItsData(p ?? { files: [] }),
  mapped_slots_have_no_unreachable_verdict: (p) =>
    mappedSlotsHaveNoUnreachableVerdict(p ?? { slots: [], divergences: [] }),
  gold_shared_prose_has_not_drifted: (p) =>
    goldSharedProseHasNotDrifted(p ?? { canonical: null, cells: {} }),
  prompt_prose_names_only_offered_verdicts: (p) =>
    promptProseNamesOnlyOfferedVerdicts(p ?? { knownVerdicts: [], slots: [] }),
  computed_rules_do_not_share_a_key: (p) =>
    computedRulesDoNotShareAKey(p ?? { items: [] }),
  no_cell_is_both_corrected_and_declared: (p) =>
    cellsBothCorrectedAndDeclared(p ?? { corrected: [], divergences: [] }),
  no_recorded_run_is_verdictless: (p) => verdictlessRuns(p ?? { artifacts: [], ns: '' }),
  consensus_fixes_are_unique: (p) => consensusFixesAreUnique(p ?? { entries: [] }),
  codes_reachable: (p) => codesReachable(p ?? { items: [] }),
  probed_fields_keep_their_text: (p) =>
    probedFieldsKeepTheirText(p ?? { receipts: [], designed: [], shaOnly: 0 }),
  no_judging_field_states_what_a_verdict_costs: (p) =>
    noJudgingFieldStatesCost(p ?? { fields: [] }),
  gold_corrections_land_on_attainable_scores: (p) =>
    goldCorrectionsAreAttainable(p ?? { items: [], corrections: [] }),
  carried_notes_are_intact: (p) =>
    carriedNotesAreIntact(p ?? { got: {}, want: {} }),
  slot_codes_exist: (p) => slotCodesExist(p ?? { items: [] }),
  no_unresolved_reference_reaches_the_page: (p) =>
    noUnresolvedReferenceReachesThePage(p as any),
  one_writer_per_computed_key: (p) =>
    oneWriterPerComputedKey(p ?? { items: [] }),
  verdict_vocabularies_correspond: (p) =>
    verdictVocabulariesCorrespond(p ?? { items: [], pairs: {}, hedges: [] }),
  every_failing_verdict_has_a_charge: (p) =>
    everyFailingVerdictHasACharge(p ?? { items: [], divergences: [], uncharged: [] }),
  pick_choices_match_rubric: (p) =>
    pickChoicesMatchRubric(p ?? { entries: [] }),
  olx_corpus_references: (p) =>
    olxCorpusReferences(p ?? { forms: [], budget: 0 }),
  rubric_slots_reach_the_sheet: (p) =>
    rubricSlotsReachTheSheet(p ?? { items: [], alias: {} }),
  sheet_slots_reach_the_rubric: (p) =>
    sheetSlotsReachTheRubric(p ?? { items: [], alias: {}, appOnly: [] }),
  the_expanded_rubric_is_current: (p) =>
    expandedRubricIsCurrent(p as any),
  slot_rules_are_vocabulary_neutral: (p) =>
    slotRulesAreVocabularyNeutral(p ?? { slots: [], known: [] }),
  prompt_deviation_tables_are_current: (p) =>
    promptDeviationTablesAreCurrent(p as any),
  gold_scores_are_attainable: (p) =>
    goldScoresAreAttainable(p ?? { items: [], cells: [] }),
  gold_tables_have_no_duplicate_keys: (p) =>
    goldTablesHaveNoDuplicateKeys(p as any),
  corrected_gold_matches_the_sheet: (p) =>
    correctedGoldMatchesTheSheet(p ?? { raw: [], fixes: [] }),
  enumerated_slots_cover_the_rubric: (p) =>
    enumeratedSlotsCoverTheRubric(p ?? { tables: [], widths: {} }),
  citations_match_exclusions: (p) =>
    citationsMatchExclusions(p ?? { items: [], exemplars: {} }),
  no_declaration_cites_a_suspect_cell: (p) =>
    noDeclarationCitesASuspectCell(p ?? { entries: [], homeOf: {}, suspect: {} }),
  shipped_text_matches_design: (p) =>
    shippedTextMatchesDesign(p ?? { designed: [], credit: {} }),
  every_prompt_field_is_designed: (p) =>
    everyPromptFieldIsDesigned(p ?? { want: {}, live: {}, shaFile: 'DESIGNED_TEXT_SHA.json' }),
  fails_verdict_is_mirrored_in_the_app: (p) =>
    runtimeParsesFailsVerdict(p ?? { name: 'slotSheet.ts', src: '' }),
  gold_columns_are_the_item_labels: (p) =>
    goldColumnsAreItemLabels(p ?? { labels: {}, sheets: {} }),
  action_attributes_are_declared_in_the_block: (p) =>
    actionAttributesAreDeclared(p ?? { blockName: 'LLMAction.ts', blockSrc: '', used: null }),
  olx_attributes_are_all_generated: (p) =>
    olxAttributesAreAllGenerated(p ?? { known: [], skip: [], items: [] }),
  response_fixtures_are_intact: (p) =>
    responseFixturesAreIntact(p ?? { items: [] }),
  consensus_spans_are_disjoint: (p) =>
    consensusSpansAreDisjoint(p ?? { cells: [], exclusions: {}, cover: {}, backlog: [], siblingRoles: [] }),
  fixture_agrees_with_gold: (p) =>
    fixtureAgreesWithGold(p ?? { cells: [], feedback: {}, boxWords: {}, overrides: {} }),
  rule_examples_are_not_corpus: (p) =>
    ruleExamplesAreNotCorpus(p ?? { corpus: {}, items: [], backlog: [] }),
  convertible_prose_rules_have_subgoals: (p) =>
    convertibleProseHasSubgoal(p as never),
  citation_necessity_is_recorded: (p) =>
    citationNecessityRecorded(p as never),
  count_scaffolds_are_arithmetic: (p) =>
    countScaffoldArithmetic(p as never),
  paper_prompt_has_no_box_deixis: (p) =>
    paperPromptBoxDeixis(p as never),
  no_recorded_run_is_an_api_error: (p) =>
    recordedRunApiError(p as never),
  ref_targets_resolve: (p) =>
    refTargetsResolve(p as never),
  derived_fields_resolve: (p) =>
    derivedFieldsResolve(p as never),
  composed_documents_are_current: (p) =>
    composedDocumentsCurrent(p as never),
  no_composed_document_repeats_itself: (p) =>
    documentSentencesDuplicated(p as never),
  every_document_is_where_its_readers_look: (p) =>
    documentsWhereReadersLook(p as never),
  records_carry_no_machine_path: (p) =>
    recordsCarryNoMachinePath(p ?? { records: [] }),
  prose_only_claims_are_current: (p) =>
    proseOnlyClaimsAreCurrent(p ?? { now: [], slots: [], judgedAgainst: {} }),
  primitive_conformance: (p) =>
    primitiveConformance(p ?? { excluding: [], excludes: {}, tags: {}, inAction: [], prompts: {} }),
  response_boxes_are_bounded: (p) =>
    responseBoxesAreBounded(p ?? { prompts: {} }),
  probe_receipts_match_shipping: (p) =>
    probeReceiptsMatchShipping(p ?? { prompts: {}, tags: {}, aliases: {}, receipts: [] }),
  new_slots_were_probed: (p) =>
    newSlotsWereProbed(p ?? { asked: {}, seen: {}, probed: {} }),
  written_rules_reach_the_shipped_prompt: (p) =>
    writtenRulesReachTheShippedPrompt(p ?? { prompts: {}, shipped: {}, recorded: [] }),
  the_course_links_the_rubric_and_every_form: (p) =>
    courseLinksEveryForm(p as any),
  exclusion_claims_are_data: (p) => exclusionClaimsAreData(p ?? { cells: [] }),
  countable_families_converted: (p) =>
    countableFamiliesConverted(p ?? { items: [], exempt: [] }),
  rubric_items_are_unique: (p) => rubricItemsAreUnique(p ?? { forms: [] }),
  every_item_has_a_findable_slot_sheet: (p) =>
    everyItemHasAFindableSlotSheet(p ?? { sheets: [], olx: '' }),
  generated_attributes_have_a_declaration: (p) =>
    generatedAttributesHaveADeclaration(p ?? { attrs: [] }),
  ratchets_only_tighten: (p) => ratchetsOnlyTighten(p ?? { ratchets: [] }),
  recorded_sides_are_readable: (p) => recordedSidesAreReadable(p ?? { sides: [], ns: '' }),
  maps_tables_are_attached: (p) => mapsTablesAreAttached(p ?? { entries: [] }),
  parked_entries_still_apply: (p) =>
    parkedEntriesStillApply(p ?? { entries: [], budget: 0 }),
  every_designed_entry_ships: (p) =>
    everyDesignedEntryShips(p ?? { entries: [], prompts: {} }),
  hand_authored_attrs_still_suppress_something: (p) =>
    handAuthoredAttrsStillSuppressSomething(p ?? { entries: [] }),
  named_fixtures_still_name_something: (p) =>
    namedFixturesStillNameSomething(p ?? { fixtures: [], knownItems: [] }),
};

export const PROBES: Record<string, Probe> = {
  // THE ASSEMBLED PAYLOAD, handed back for a caller to PATCH.
  //
  // A ported check whose python side owns ONE of the rule's inputs cannot use
  // self-assembly: the runner would rebuild that input from disk and lose
  // whatever python holds in memory. It also must not rebuild the WHOLE payload
  // in python, because that restores the duplicate implementation the port
  // removed.
  //
  // So it asks for the payload, replaces the part it owns, and sends it back.
  // The assembler stays the single definition of the payload's shape, and the
  // seam is visible: exactly one field is python's.
  //
  // It is also how a port PROVES its assembler -- item 2 of the port standard
  // is a comparison against python's payload, and before this there was no way
  // to read the assembler's output from python at all.
  assemble: (p) => {
    const o = (p ?? {}) as { rule?: string; ns?: string };
    const asm = NATIVE[String(o.rule)];
    if (!asm) {
      throw new Error(
        `assemble: no native assembler for ${JSON.stringify(o.rule)}; this ` +
        `package assembles ${JSON.stringify(Object.keys(NATIVE).sort())}`);
    }
    return asm(String(o.ns ?? ''));
  },

  resolve_corpus_refs: (p) => resolveCorpusRefs(p ?? { data: {}, refs: [] }),
  parse_slot_specs: (p) => parseSlotSpecs(p ?? { specs: [] }),
  score_recorded_sheets: (p) =>
    scoreRecordedSheets(p ?? { sheets: {}, payloads: [] }),

  // THE VERDICT VOCABULARY, EVALUATED RATHER THAN SCRAPED. `slot_vocab` used to
  // restate these lists; replacing that with a regex over this package's SOURCE
  // was no better -- it promptly produced a garbage token by letting a `//`
  // comment run into the item after it. A probe hands back the real value of
  // the real module, so there is nothing to parse and nothing to drift.
  // THE SPLIT DOCUMENTS, evaluated rather than restated. `compose_docs` used to
  // declare this list on the python side and the rule carried a second copy;
  // one value now answers both, for the reason the vocabulary probe above
  // exists -- a list that drifts stops a document being checked while it still
  // looks checked.
  split_documents: () => ({
    SPLIT_DOCS: [...SPLIT_DOCUMENTS],
    NO_COURSE_HALF: { ...NO_COURSE_HALF_DECL },
  }),

  verdict_vocabulary: () => ({
    WEB_EXTRAS: [...EXTRA_VERDICTS],
    HEDGES: [...VERDICT_HEDGES],
    RUBRIC_EXTRAS: [...RUBRIC_EXTRAS],
    KNOWN_VERDICTS: [...KNOWN_VERDICTS],
  }),
};

export {
  caseNamesInPrompts, cellsBothCorrectedAndDeclared, computedRulesDoNotShareAKey,
  consensusFixesAreUnique, namedFixturesStillNameSomething,
  codesReachable,
  probedFieldsKeepTheirText,
  noJudgingFieldStatesCost,
  goldCorrectionsAreAttainable,
  carriedNotesAreIntact,
  slotCodesExist,
  noUnresolvedReferenceReachesThePage,
  oneWriterPerComputedKey,
  verdictVocabulariesCorrespond,
  everyFailingVerdictHasACharge,
  pickChoicesMatchRubric,
  olxCorpusReferences,
  rubricSlotsReachTheSheet,
  sheetSlotsReachTheRubric,
  expandedRubricIsCurrent,
  slotRulesAreVocabularyNeutral,
  promptDeviationTablesAreCurrent,
  goldScoresAreAttainable,
  goldTablesHaveNoDuplicateKeys,
  correctedGoldMatchesTheSheet,
  enumeratedSlotsCoverTheRubric,
  citationsMatchExclusions,
  noDeclarationCitesASuspectCell,
  shippedTextMatchesDesign,
  everyPromptFieldIsDesigned,
  runtimeParsesFailsVerdict,
  goldColumnsAreItemLabels,
  actionAttributesAreDeclared,
  olxAttributesAreAllGenerated,
  responseFixturesAreIntact,
  consensusSpansAreDisjoint,
  fixtureAgreesWithGold,
  ruleExamplesAreNotCorpus,
  recordsCarryNoMachinePath,
  proseOnlyClaimsAreCurrent,
  primitiveConformance,
  responseBoxesAreBounded,
  probeReceiptsMatchShipping,
  newSlotsWereProbed,
  writtenRulesReachTheShippedPrompt,
  courseLinksEveryForm,
  exclusionClaimsAreData,
  countableFamiliesConverted,
  rubricItemsAreUnique,
  everyItemHasAFindableSlotSheet, generatedAttributesHaveADeclaration,
  everyDesignedEntryShips, handAuthoredAttrsStillSuppressSomething,
  parkedEntriesStillApply, mapsTablesAreAttached, recordedSidesAreReadable,
  ratchetsOnlyTighten,
  verdictlessRuns,
  promptProseNamesOnlyOfferedVerdicts,
  parseSlotSpecs, resolveCorpusRefs, scoreRecordedSheets,
};
