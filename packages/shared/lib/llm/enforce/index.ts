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

import { caseNamesInPrompts } from './caseNames';
import { computedRulesDoNotShareAKey } from './computedKeys';
import { promptProseNamesOnlyOfferedVerdicts } from './offeredVerdicts';
import { parseSlotSpecs, resolveCorpusRefs } from './probes';
import { consensusFixesAreUnique, namedFixturesStillNameSomething } from './declarations';
import { everyDesignedEntryShips, handAuthoredAttrsStillSuppressSomething }
  from './designedText';
import { cellsBothCorrectedAndDeclared } from './goldTables';
import { parkedEntriesStillApply } from './parked';
import { ratchetsOnlyTighten } from './ratchet';
import { verdictlessRuns } from './recordedRuns';
import { everyItemHasAFindableSlotSheet, generatedAttributesHaveADeclaration }
  from './sheetDiscovery';
import { scoreRecordedSheets } from './rescore';

export type Finding = string;
export type Rule = (payload: any) => Finding[];
export type Probe = (payload: any) => unknown;

export const RULES: Record<string, Rule> = {
  no_case_names_in_prompts: (p) => caseNamesInPrompts(p?.prompts ?? []),
  prompt_prose_names_only_offered_verdicts: (p) =>
    promptProseNamesOnlyOfferedVerdicts(p ?? { knownVerdicts: [], slots: [] }),
  computed_rules_do_not_share_a_key: (p) =>
    computedRulesDoNotShareAKey(p ?? { items: [] }),
  no_cell_is_both_corrected_and_declared: (p) =>
    cellsBothCorrectedAndDeclared(p ?? { corrected: [], divergences: [] }),
  no_recorded_run_is_verdictless: (p) => verdictlessRuns(p ?? { artifacts: [] }),
  consensus_fixes_are_unique: (p) => consensusFixesAreUnique(p ?? { entries: [] }),
  every_item_has_a_findable_slot_sheet: (p) =>
    everyItemHasAFindableSlotSheet(p ?? { sheets: [], olx: '' }),
  generated_attributes_have_a_declaration: (p) =>
    generatedAttributesHaveADeclaration(p ?? { attrs: [] }),
  ratchets_only_tighten: (p) => ratchetsOnlyTighten(p ?? { ratchets: [] }),
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
  resolve_corpus_refs: (p) => resolveCorpusRefs(p ?? { data: {}, refs: [] }),
  parse_slot_specs: (p) => parseSlotSpecs(p ?? { specs: [] }),
  score_recorded_sheets: (p) =>
    scoreRecordedSheets(p ?? { sheets: {}, payloads: [] }),
};

export {
  caseNamesInPrompts, cellsBothCorrectedAndDeclared, computedRulesDoNotShareAKey,
  consensusFixesAreUnique, namedFixturesStillNameSomething,
  everyItemHasAFindableSlotSheet, generatedAttributesHaveADeclaration,
  everyDesignedEntryShips, handAuthoredAttrsStillSuppressSomething,
  parkedEntriesStillApply,
  ratchetsOnlyTighten,
  verdictlessRuns,
  promptProseNamesOnlyOfferedVerdicts,
  parseSlotSpecs, resolveCorpusRefs, scoreRecordedSheets,
};
