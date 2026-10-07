#!/usr/bin/env python3
"""Build the STUB COURSE: the minimal course the scorer falls back to.

WHY A STUB AND NOT LAZY LOADING. A scorer needing course data to load is a
logical necessity -- there is nothing to score without it -- and
`coursedata.gold_declaration` records the eager binding as deliberate ("EAGER AT
THE CALL SITE, BY DESIGN", subgoal C1b). The problem is the BOOTSTRAP case:
starting a new project should not mean borrowing a real cohort's course. So the
engine ships a default it can initialise against, which a user repoints or edits.

THE CONTRACT IS DERIVED, NOT GUESSED. Every table name below comes from the
module-level load sites in the engine -- `_declaration`, `_gold_declaration`,
`_generator_table`, `_generator_value` -- because `coursedata.declaration` raises
KeyError on a name it does not find: "if it is a new table, the export must carry
it; if it was removed, the reader of it must go too." Keys must EXIST; values may
be empty. Regenerate this rather than hand-editing, so the stub tracks the
contract instead of drifting from it.
"""
import json
import pathlib
import sys

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "stub_course")

# Derived from the engine's module-level `_declaration(...)` calls, plus the
# three the real course file carries that no eager site names (GOLD_COMMENT_
# PHRASES, JOBS, HANDOUT_FIELDS) -- present because a reader may reach them
# later and an absent key is a KeyError, not a default.
DECLARATIONS = [
    "APP_ONLY_SLOTS", "ASK_EQUIVALENT_PROMPTS", "CONTEXT_SOURCE", "COUNTABLE_EXEMPT",
    "DECOMPOSITION_DIVERGENCES", "DESIGNED_TEXT", "GOLD_COMMENT_PHRASES",
    "HAND_AUTHORED_ATTRS", "HANDOUT_FIELDS", "JOBS", "MULTI_BLOCK_DECLARED",
    "PAPER_ITEM_NOTES", "PAPER_ITEM_NOTES_WHY", "PROBE_UNREACHABLE_PAIRS",
    "PROSE_ONLY_JUDGED_AGAINST", "PROSE_ONLY_SLOTS", "SELFTEST_NAMED_FIXTURES",
    "UNCHARGED_VERDICTS",
]

# Derived from `_gold_declaration(...)`. `_1C_GATE_CEILING` is NAMED FOR AN ITEM
# of one course and is carried here only so the stub satisfies today's readers;
# it is queued for renaming, and this list should lose it at that point.
GOLD_DECLARATIONS = [
    "CONSENSUS_OVERLAP_BACKLOG", "CORRECTED_GOLD", "DECLARED_CEILING_CELLS",
    "FIXTURE_GOLD_OVERRIDES", "GOLD_CEILINGS", "GOLD_CODE_CHARGES", "GOLD_CODE_KNOWN",
    "GOLD_DIVERGENCES", "GOLD_SLOT_BOUNDS_KNOWN", "GOLD_SLOT_CHARGES",
    "GOLD_SLOT_DISAGREEMENTS_KNOWN", "GOLD_SLOT_UNMAPPABLE", "PER_ITEM_EXCLUDE",
    "SILENT_GOLD_DIVERGENCES", "UNSCORED_GOLD_CRITERIA", "_1C_GATE_CEILING",
]

# Declared here because `GENERATOR` below needs it.
HANDOUTS_DECLARED = (1, 2)

# TYPES MATTER, not just names: four of these are dicts and two are lists in the
# real course file, and an empty value of the wrong shape fails later and
# further away than a missing key does. Building the stub is what surfaced this.
GENERATOR = {"SCORING_DIVERGENCES": [], "PROBE_REACH_LIMITS": [],
             "TABLE_ORDER": {}, "CONTEXT_REFS": {},
             "CONTEXT__non_item": {},
             # SEGMENT MARKERS, declared rather than left empty. `segment()`
             # splits a submission into sections by matching these against the
             # document's lines, and with none it returns `{}` -- the scorer then
             # ran happily on an EMPTY response and reported `response_chars: 0`.
             # A stub that scores nothing is not a stub that scores.
             # Shape: {handout: [[section id, regex], ...]}, section id = item id.
             "SEGMENT_MARKERS": {str(h): [[f"S{h}", "A stub question"]]
                                 for h in HANDOUTS_DECLARED}}

# ONE item, ONE handout. PRESENCE IS MEANINGFUL on the per-item `prompt_*`
# fields: `_generator_table(name)` collects `item[name]` only from items that
# CARRY it, and consumers assume the type. `prompt_sheet_only` holds a block-id
# STRING, so an empty list there reaches `a.startswith(...)` and raises. The real
# course's first item omits every field it does not use, and so does this.
def _item(iid: str, handout: int) -> dict:
    """One item. PRESENCE IS MEANINGFUL on the `prompt_*` fields:
    `_generator_table(name)` collects `item[name]` only from items that CARRY it,
    and consumers assume the type -- `prompt_sheet_only` holds a block-id STRING,
    so an empty list there reaches `a.startswith(...)` and raises. The real
    course's items omit every field they do not use, and so do these."""
    # SO THE FIELDS ARE OMITTED, not emitted empty. `_generator_table` collects
    # `{iid: gen[field] for ... if field in gen}` -- "Absent keys stay ABSENT" --
    # so an item carrying `"prompt_response": []` JOINS the RESPONSE table with
    # an empty value instead of staying out of it, and `in SHEET_ONLY` stops
    # meaning what it means. An earlier draft of this builder emitted them empty,
    # on a comment claiming they had to be present; the reader says otherwise and
    # the reader is the contract.
    return {"id": iid, "handout": handout}


# TWO HANDOUTS, NOT ONE, and this is a FINDING rather than a preference:
# `score.py:42` binds `_RUBRIC2 = config(2)` at module level, so handout 2 must
# EXIST or the paper scorer will not import. Nine other modules hardcode
# `config(1)`/`config(2)`/`config(3)` the same way (goal J-3). When J-3 lands and
# those iterate `sorted(handouts.HANDOUTS)` instead, this stub can shrink to one.
HANDOUTS_DECLARED = (1, 2)

# THE CRITERIA HANDOUT. `score._criteria_rubric()` binds the rubric of the one
# handout whose items declare `derive_from_criteria`, and REFUSES on none or on
# several -- "falling back to a number is how an engine scores the wrong handout
# and says nothing" (J-3). Declaring none made `score.py` unimportable against
# the stub, so exactly one is declared here and the stub exercises that path.
CRITERIA_HANDOUT = 2

# The DERIVED values, declared AUTHORED-EMPTY on every handout.
#
# `coursedata.derived()` treats an empty derivation as ABSENT -- "EMPTY IS
# ABSENT, not an answer" -- and falls through to the authored value in the course
# file; `_RubricView.__getattr__` then raises AttributeError when there is none,
# which is also deliberate ("`getattr(rub, "SLOT_SPEC", {})` is a real call
# site"). Both are by design, so a course that uses none of these primitives must
# DECLARE them empty rather than have the engine changed. This list is the
# pattern for any such course.
DERIVED_EMPTY = [
    "AVOIDANCE_SCORES", "BARRIER_PICK_ITEMS", "CADENCE_BARRIER_ITEMS",
    "CONTINGENCY_GATE_ITEMS", "FORBID", "MAPS", "MOVE_PICK_ITEMS", "OC_FRAME",
    "OC_GATES", "POLARITY_GATE_ITEMS", "READS_UTB_CHOICE", "REQUIRED_MOVE",
    "SLOT_OPTIONS", "SLOT_SPEC", "TYPE_MATCH_ITEMS",
]


# THE HANDOUT DATA THE SCORER NEEDS, declared rather than defaulted. J-4c made
# an undeclared field ABSENT instead of inheriting the engine's course, which is
# right -- and it means a stub that wants to be SCORED must say where its own
# data lives. `score_participant` reads `rubric`, `outdir`, `blurb`, `template`,
# `markers` and `capture_tail`; the first is engine wiring and `markers` comes
# from the course file already, so these four are what remain.
#
# The paths are LEAVES: `handouts.py` joins them to `SUBS` and `OUT`, which for a
# course with no `shared_data_layout` are $COURSE_DATA/courses/<ns>/.
HANDOUT_DATA = {h: {"template_file": f"stub_handout{h}_template.docx",
                    "submissions_dir": f"h{h}",
                    "outdir_name": f"h{h}",
                    "blurb": f"the stub course, handout {h}",
                    "capture_tail": True,
                    "exemplar_participants": []}
                for h in HANDOUTS_DECLARED}

COURSE = {
    "schema_version": 1,
    "course": "stub",
    "forms": {str(h): {"authored": {k: [] for k in DERIVED_EMPTY}}
                 for h in HANDOUTS_DECLARED},
    "items": [_item(f"S{h}", h) for h in HANDOUTS_DECLARED],
    "generator": dict(GENERATOR),
    "declarations": {**{k: [] for k in DECLARATIONS},
                     "HANDOUT_FIELDS": [[str(h), v]
                                        for h, v in sorted(HANDOUT_DATA.items())]},
}

GOLD = {
    "schema_version": 1,
    "course": "stub",
    "declarations": {k: [] for k in GOLD_DECLARATIONS},
    "handout_participants": {str(h): [] for h in HANDOUTS_DECLARED},
    "declaration_notes": {},
}

# THE ATTRIBUTE VOCABULARY IS THE READER'S, NOT A GUESS. An earlier draft wrote
# `<Item id=... handout=...>`, `verdicts="met,absent"` and `points="1"`, and the
# component parsed cleanly while yielding NOTHING: `as_view_items` keys on
# `el.get("scores")` and skips an Item without it. A rubric that parses is not a
# rubric that reads. These names are taken from the real component:
#   Item     scores= max= label= grading=      (NOT id=; the handout comes from
#                                               the course file's item entry)
#   Slot     key= label= pts=
#   Credit   what= pts= verdicts= codes=       (verdicts are `|`-separated)
#   Deduction code= pts=

# THE STUB'S CRITERIA FACTS AND GATE, DECLARED. Goal M.
#
# Goal E gave the stub its own Python scorer so it would stop borrowing
# edu.memphis.psych's operant-conditioning frame. Goal M removes the Python: the
# facts and the gate are declared in the rubric and read by the engine's generic
# `criteria` scorer, so a second course needs no code at all.
#
# `gate="true" charge="..."` is the vocabulary `rubric_component` already read
# into `oc_gates` -- "an oc_gate is a SLOT THAT CHARGES". Order is declaration
# order, which is the short-circuit order.
FACTS = """
    <Slot key="answered" label="The response says something" gate="true"
          charge="STUB_MISS" because="Nothing was answered."/>
    <Slot key="on_topic" label="What it says is about the question" gate="true"
          charge="STUB_MISS" because="The answer is not about the question."/>"""


# THE PROMPT FRAGMENTS. `olx_prompts` refuses a fragment it cannot find -- "the
# generator holds no default prose -- a missing one truncates a prompt in
# silence" -- so the stub must carry the WHOLE set, not the ones a first run
# happened to reach. Enumerated from the real component's
# `<Frame name="fragment:...">` declarations rather than discovered one failure
# at a time, which is how the list stays complete when a new fragment is added.
FRAGMENTS = [
    "askedFor", "boxClose", "boxOpen", "checklistPreamble", "contextHeading",
    "contextPreamble", "countsNote", "creditHeading", "deductionHeading",
    "derivedContains", "derivedNote", "derivedPlots", "derivedPresent",
    "endOfResponse", "equalsLenient", "equalsNote", "expectLenient",
    "expectNote", "forbidNote", "gateNote", "guidanceHeading", "itemHeading",
    "mapsNote", "questionHeading", "responseHeading", "responsePreamble",
    "sectionHeading", "webSystem",
]

RUBRIC = """<Rubric id="stub_rubric" title="Stub scoring rubric">
  <!-- The smallest rubric that READS: one item per declared handout, each with
       one slot, one credit and one deduction. It exists so the engine can
       initialise and be scored against without a real course. Edit it, or
       repoint $COURSE_DATA at a real one. -->
%s%s</Rubric>
""" % ("".join('''  <Frame name="fragment:{n}">
    <Segment>[stub {n}] </Segment>
  </Frame>
'''.format(n=n) for n in FRAGMENTS), "".join(
    '''  <Item scores="S{h}" max="1" label="Stub item {h}" grading="slots"{crit}>
    <Question>A stub question, answered by a stub slot.</Question>
    <Slot key="stub_slot" label="The stub slot" pts="1"/>{facts}
    <Credit what="stub_slot" pts="1" verdicts="met|absent" \
codes="absent=STUB_MISS">The stub slot was met.</Credit>
    <Deduction code="STUB_MISS" pts="1">The stub slot was not met.</Deduction>
  </Item>
'''.replace(" \\\ncodes=", ' codes=').format(h=h, crit=(' deriveFromClauses="true" deriveFrom="criteria"'
                            if h == CRITERIA_HANDOUT else ""),
                    facts=(FACTS if h == CRITERIA_HANDOUT else ""))
    for h in HANDOUTS_DECLARED))


# THE STUB SHIPS NO PYTHON SCORER. Goal M.
#
# Goal E gave it one (`scorers/stub.py`) so it would stop borrowing
# edu.memphis.psych's operant-conditioning frame. M removed the need: the facts
# and the gate are declared in `stub_rubric.olx` above, and the engine's generic
# `criteria` scorer reads them. That is M's own completion test -- "a second,
# trivial criteria scorer declared entirely in a rubric, with no Python at all".
#
# If a course DOES need behaviour no declaration can express, it still ships a
# module: `scorers.resolve` looks at the course before the built-ins. The point
# is that a course should not have to.


# THE `<rubric id>_qc/` DIRECTORY, part of the standard structure of ANY course.
#
# A rubric keeps its quality-control documents in `<course>/<rubric id>_qc/`:
# the rubric-specific halves of the split guides, its ledgers, and the records
# of what was decided about it. The generic halves live once, with the
# machinery, in `scoring/qc/`. The pairing is the point -- a document's ROLE is
# read off its path, so neither half needs a declaration saying which it is.
#
# THE RUBRIC OWNS IT, NOT THE COURSE, which is why the name carries the rubric
# id. A course may carry several rubrics; one shared `qc/` would have made them
# compose each other's halves. `paths.qc_dirname` derives the name from the
# rubric id -- `stub` here, so `stub_qc` -- and this builder asks rather than
# spelling it, so the stub cannot drift from the rule the engine applies.
#
# THE STUB HAS ONE BECAUSE EVERY COURSE HAS ONE. The user's instruction of
# 2026-09-26 was to treat `qc/` as standard structure "including the stub
# course", and a fixture that omits part of the standard shape is a fixture
# that cannot catch a reader assuming it. `paths._qc_documents` enumerates this
# directory for whatever course is active; against the stub it answered `{}`
# for the same reason the stub's other gaps were found -- nothing was there to
# read, which is indistinguishable from nothing looking.
#
# WHAT IT HOLDS, and what it deliberately does not. One real document: the
# course-specific half of README.md. The stub's OTHER three split documents
# have no course half, which is a true statement about a course with no
# measurements, no closed goals and no waived findings -- and
# `compose_docs.NO_COURSE_HALF` is how an absence is declared rather than
# sniffed. Writing three empty halves to fill the directory would make the
# fixture assert a shape that no real course has at the start.
QC_README = """# The stub course

The course-specific half of `README.md`. The generic half is in `scoring/qc/`,
and `compose_docs.compose` places the blocks below at its anchors.

This half exists so that the stub carries the same `qc/` structure every course
carries. It is a BUILD PRODUCT like everything else here: edit
`build_stub_course.py`, not this file.
"""


RUBRIC_STEM = "stub_rubric"


def _qc_dirname() -> str:
    """`<rubric id>_qc`, asked of the engine rather than spelled here.

    The stub exists to catch a reader assuming something the contract does not
    promise, so it must not itself hardcode a name the contract derives. If
    `paths` cannot be imported -- this builder runs standalone, with no course
    configured -- it falls back to the same construction from this stub's own
    rubric filename, which is what `_scoring_id` would derive anyway.
    """
    try:
        import paths                                  # type: ignore
        return paths.qc_dirname(ns=COURSE["course"])
    except Exception:
        return f'{RUBRIC_STEM.removesuffix("_rubric")}_qc'


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "rubric.json").write_text(json.dumps(COURSE, indent=2, sort_keys=True) + "\n")
    (OUT / "gold.json").write_text(json.dumps(GOLD, indent=2, sort_keys=True) + "\n")
    (OUT / "stub_rubric.olx").write_text(RUBRIC)
    qc = OUT / _qc_dirname()
    qc.mkdir(exist_ok=True)
    (qc / "README.md").write_text(QC_README)
    print(f"  wrote {OUT}/course.json        "
          f"{len(DECLARATIONS)} declarations, {len(GENERATOR)} generator tables, "
          f"{len(COURSE['items'])} item(s), {len(DERIVED_EMPTY)} derived-empty")
    print(f"  wrote {OUT}/gold.json          {len(GOLD_DECLARATIONS)} gold declarations")
    print(f"  wrote {OUT}/stub_rubric.olx    {len(HANDOUTS_DECLARED)} item(s), "
          f"{len(FRAGMENTS)} fragments, criteria handout {CRITERIA_HANDOUT}")
    print(f"  wrote {qc}/README.md   the rubric-specific half; the "
          f"other three split documents have no rubric half yet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
