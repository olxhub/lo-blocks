# The stub course

The minimal course the scorer can initialise against when no real course is
supplied. It exists so that starting a new project does not mean borrowing a
real cohort's data.

Everything here is a BUILD PRODUCT. Edit `build_stub_course.py` and re-run it;
do not hand-edit `course.json`, `gold.json` or `stub_rubric.olx`, or the stub
drifts from the contract it is meant to track.

    python3 build_stub_course.py .

The build is byte-reproducible: re-running it over an unchanged builder rewrites
the same three files.

## Running the engine against it

Three variables, and nothing else:

    export COURSE_FILE=<this dir>/course.json
    export COURSE_NS=stub
    export COURSE_RUBRIC_OLX=<this dir>/stub_rubric.olx

`COURSE_RUBRIC_OLX` is needed because this rubric is NOT in the staged content
layout -- it sits beside its own `course.json` and is never staged, so no
combination of namespace and component name reaches it.

Verified 2026-09-24: eight modules import with no real course present --
`coursedata`, `handouts`, `olx_prompts`, `score`, `course_schema`, `leakage`,
`measured`, `agreement`. The engine SCORING the stub end to end is not yet met;
that is the rest of goal J.

## What the stub has to declare, and why

Each of these was discovered by a failure, and each is a contract the engine
states somewhere. They are listed here so the next person meets them as
requirements rather than as bugs.

* **Every declaration key must EXIST.** `coursedata.declaration` raises KeyError
  on a name it does not find. Values may be empty; keys may not be absent.
* **The rubric's attribute vocabulary is the READER'S.** `as_view_items` keys on
  `el.get("scores")` and skips an `<Item>` without it. An earlier draft used
  `id=`, `points=` and comma-separated verdicts; it parsed cleanly and yielded
  nothing. *A rubric that parses is not a rubric that reads.*
* **All 28 prompt fragments must be present.** `olx_prompts` refuses one it
  cannot find, because "a missing one truncates a prompt in silence". They are
  enumerated in the builder from the real component's `<Frame>` declarations.
* **Exactly one handout must carry the criteria items.**
  `score._criteria_rubric()` binds one rubric at import and refuses on none or
  several. The stub declares `CRITERIA_HANDOUT = 2`.
* **Absence is spelled by OMITTING a field, not by emitting an empty one.**
  `_generator_table` collects `{iid: gen[field] ... if field in gen}`, so an item
  carrying `"prompt_response": []` JOINS that table with an empty value instead
  of staying out of it. The per-item `prompt_*` fields are omitted here.
  `course_schema.OPTIONAL_ITEM_FIELD_TYPES` is the declared contract.
* **Derived values must be declared empty when unused.** `coursedata.derived()`
  treats an empty derivation as ABSENT and falls through to the authored value;
  `_RubricView.__getattr__` then raises. Both are deliberate, so a course using
  none of these primitives declares them empty rather than having the engine
  changed. See `DERIVED_EMPTY` in the builder.
