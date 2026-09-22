# Documentation and playgrounds for the blocks added since `main`

**Status: a plan, not a record.** Nothing here is done. It is scheduled after
items 3 and 4 of the rubric migration (ending the rubric duplication, and moving
the criteria prose into the rubric).

## Why this exists

`lo-blocks` has diverged from `origin/main` by 27 commits at merge-base
`3fffe156`. That work added **61** files and modified **15** under
`components/blocks`, defining or changing **32 blocks** — most of them a whole new
`rubric` family that lets a rubric live in the content as a component.

Every playground that exists passes: `docPlaygrounds.test.ts` is green at
**209/209**. That is a strong check — it parses each snippet with the real
`parseOLX` and then runs `parseDerived`, `parseSlots`, `scoreSlotSheet` and
`verdictFor` over it, which is how it caught every `derived=` in the grading docs
being written `key:ref` when the grammar is `key:kind:refs`, a form `parseDerived`
silently DROPS.

**But a passing suite cannot see a missing file or a wrong sentence.** 14 of the
22 rubric blocks have no documentation at all, so they contribute no playground to
that 209 and the green number says nothing about them.

## 1 · Blocks with NO documentation — write it

These 14 are the vocabulary an author writes a rubric in. They are the highest
priority precisely because the end state is a HAND-AUTHORED rubric: without docs,
the authoring step has no reference.

| block | what it does | playground should show |
|---|---|---|
| `Credit` | a scored component: what it judges, what it is worth, what it charges | `what`/`pts`/`verdicts`/`codes`, and a row that scores nothing but is still reported |
| `Slot` | one line of the judging sheet | `seg`, `pts`, and a gating slot with `charge`/`because` |
| `Map` | value → verdict mapping with a fallback | `pairs="a~met,b~absent"` and `fallback` |
| `Forbid` | a verdict forbidden when conditions hold | `conds="slot=value,slot=value"` |
| `Expect` | a slot expected to take a given value | `left`/`value`, and `lenient` |
| `Equals` | two slots that must agree | `left`/`right`/`lenient` |
| `Onlyif` | a check that applies only when another is met | `key`/`cond` |
| `Requires` | a check requiring another, leniently | `key`/`cond`/`lenient` |
| `Derived` | a verdict computed from fields, not judged | `kind`, `fields`, `words`, and the `key:kind:refs` grammar |
| `Cover` | one verdict covering several checks | `checks`/`labels`/`verdicts` |
| `Counts` | a count over named slots | `key`/`slots` |
| `Context` | another item's answer, shown as context | `item` |
| `Question` | the question text the item scores | its relationship to the content element |
| `Param` | a value for a frame placeholder | with `Frame`/`Segment` |

**Each needs at least one `olx:playground`,** which is what puts it under
`docPlaygrounds.test.ts` — an undocumented block is also an unexercised one.

## 2 · Documented but with NO playground — add one

| block | note |
|---|---|
| `Slot` | documented, zero playgrounds, and it is the most-used element in a rubric |
| `PrintAction` | pre-existing gap, not from this work |
| `OnChange` | new in this work |
| `SelfMonitorPlot` | new in this work, and its schema has 8 undocumented attributes (below) |

## 3 · Documentation that is WRONG — fix it

`Item.md` is confirmed wrong and actively misleading:

* its attribute table says the item names its content with **`ref`**
* `Item.ts` takes **`scores`**, and says why: *"the platform reserves `ref` for
  `<Use>` elements and the parser refuses it anywhere else. Worth knowing before
  authoring, not after — the reserved name is the natural one to reach for."*
* the playground below it uses `scores`, so the suite passes while the table
  sends an author into a parser refusal

`Item.md` also omits `use`, which is how an item cites an `ItemTemplate` — the
mechanism the hand-authored rubric will lean on hardest.

## 4 · Drift in the reference tables — attributes, CHILDREN and VALUES

A mechanical scan compared each documented block's attribute table against its
`z.object` schema and reported 17 blocks with differences. When that scan was
first read, differences where the doc table listed a child ELEMENT or an
attribute VALUE rather than an attribute were set aside as scan noise. **That was
wrong.** A block's children and its permitted values are part of what an author
has to know to write the element; the scan's output is not "17 attribute bugs and
some noise", it is three DIFFERENT documentation obligations tangled together.

**And then the premise under §4a and §4c turned out to be wrong too.** See §8a:
the doc page already renders an attribute table GENERATED from the schema, enum
values included. A hand-written attribute table in a `.md` is a second
implementation of it. §4a and §4c below are therefore mostly not edits to make —
they are a list of tables to DELETE. What survives as real work is §4b, children,
which the schema does not carry.

### 4a · Attributes missing from the table
*(read §8a first — most of these rows are answered by deleting the table)*

* `Item` — `ref` vs `scores` (§3 above)
* `Slot`, `Deduction` — `ifDeclared` in the schema, absent from the docs
* `SelfMonitorPlot` — 8 undocumented: `chartTitle`, `chartTitleTarget`,
  `height`, `width`, `xlabel`, `xlabelTarget`, `ylabel`, `ylabelTarget`
* `LLMAction` — `choices`, `free`, `max`, `showChecks`, `slots`, `target`,
  `verdicts` reported missing from the table; some may be covered in prose, so
  confirm each against the doc body before editing
* `CodeInput`, `LiquidTemplate`, `OlxSlot`, `SimpleTextSelection`,
  `TextSelectionInput` — `id` only, which is universal; no edit expected
* `IntakeGate`, `TimedContainer`, `WordUsage`, `Freewrite` — pre-existing, not
  from this work; record whether each is real before touching it

### 4b · Child elements a block accepts

Measured on the built `bmod_rubric.olx`, which is the corpus these blocks exist
for. Every count below is a real element an author will write:

```
Rubric  -> Item x26, Verdicts x5, Frame x2
Item    -> Slot x217, Guidance x164, Credit x116, Deduction x107, Context x55,
           Question x26, Forbid x7, Map x6, Onlyif x6, Equals x6, Expect x5,
           Counts x4, Derived x3, Requires x3, Cover x2
Frame   -> Segment x4
```

`Item.md` documents **none** of its 15 child element types. That is the single
largest gap in the rubric reference: an author reading `Item.md` learns the
attributes of the element and nothing about what goes inside it, which is where
all the content lives. `Rubric.md` and `Frame.md` name their children and need
only checking, not writing.

Also to document rather than assume: the seven rubric blocks that carry a TEXT
BODY (`Credit`, `Deduction`, `Guidance`, `Param`, `Question`, `Segment`, `Slot`
— they use `parsers.text.raw()`). For `Slot` the body is the judging description
shown to the grader, which is distinct from its `label`; that distinction is
exactly the kind of thing an attribute table cannot carry and a reader cannot
guess.

### 4c · Enumerated attribute values
*(read §8a first — `extractAttributes` already emits `enumValues`, so the
generated table shows every one of these; the table below is what the DUPLICATE
is missing, not what an author cannot see)*

Schema `z.enum` values that appear nowhere in the block's doc. Where a doc omits
only the negative of a boolean-ish pair the fix may be one clause; where it omits
a real vocabulary the doc is incomplete:

| block | attribute | values not in the doc |
|---|---|---|
| `StateViewer` | `scope` | `component`, `componentSetting`, `system`, `storage` |
| `CompactPopout` | `mode` | `fullscreen`, `window`, `target` |
| `BadBlock` | `throws` / `kind` | `none`,`parse`,`render` / `native`,`apperror`,`undefined` |
| `SortableInput` | `dragMode` | `whole`, `handle` |
| `SortableGrader` | `algorithm` | `survey` |
| `AggregatedInputs` | `aggregate` / `asObject` | `object` / `true`,`false` |
| `LLMFeedback` | `render` | `markdown` |
| `Credit` | `reported`, `gates` | `true`, `false` |
| `Item` | `deriveFromClauses`, `deriveFromCredit` | `true`, `false` |
| `Slot` | `gate`, `reported`, `gates` | `false` |
| `Deduction` | `repeatable` | `false` |
| `LLMAction` | `showChecks` | `true`, `false` |
| `SheetValue` | `strip` | `false` |
| `CheckboxGrader` | `partialCredit` | `false` |
| `Navigator` | `searchable` | `false` |
| `CodeInput` | `language` | expands from `PEG_CONTENT_EXTENSIONS` — document the list or point at it |

Two earlier scan entries resolve here rather than as attribute bugs, and are
still work: `DerivedChecks`' `complete`/`contains`/`plots`/`present` are `kind`
VALUES and belong in a values table; `Explanation`'s `always`/`answered`/`never`
are `showWhen` values. `CapaProblem`'s `ChoiceInput`/`LineInput`/… are children
and belong in a children section like §4b's.

## 5 · `lib/llm` has two documented modules and several undocumented ones

`materialiseRubric.md` and `itemTemplate.md` exist. `promptAssembler.ts` (327
lines), `promptAssembler.types.ts` (282), `attributeAssembler.ts` (222),
`slotSheet.ts`, `derivedVerdicts.ts` and `runnerGuards.ts` have none. These are
not blocks and carry no playgrounds, so nothing in the suite looks at them at all.

## 6 · Order of work

0. Settle §8d — whether the rubric family stays `internal: true`. It gates
   step 1: docs the browser hides by default are most of the work for a
   fraction of the benefit.
1. The 14 undocumented rubric blocks, **`Credit` and `Slot` first** — they are
   what an author writes most.
2. `Item.md`'s `ref`/`scores` row, because it is wrong rather than missing.
3. Playgrounds for the four documented-but-unexercised blocks.
4. `Item.md`'s children section (§4b) — 15 element types, none documented, and
   the reference an author needs most after the blocks themselves.
5. **Delete the 32 hand-written attribute tables (§8a)**, rehoming per table only
   what the schema cannot carry. Do this BEFORE §4a/§4c: most of those rows stop
   existing once the duplicate is gone, and editing a table you are about to
   delete is wasted work.
6. The nine missing `.describe()` calls (§8a) — in the schema, not the docs.
7. Whatever §4a and §4c still have left after step 5, each verified individually.
8. The 23 legacy blocks with no README (§8b), family-grouped, most-reached-for
   first.
9. `lib/llm` module docs.

## 7 · How the work is checked

* `npx vitest run docPlaygrounds` — every new playground joins the 209 and must
  parse AND survive the semantic pass. A playground is the test.
* Re-run the audit, and **commit it** rather than re-deriving it each time. It
  must read the registry through `extractAttributes`, not a regex over the
  sources: the regex pass missed every attribute declared with a helper like
  `z_olx_boolean` and reported eight false findings against `Freewrite` alone.
  It should report, per block: no README, no example, an own attribute with no
  `.describe()`, and — once §8a lands — a `.md` that has grown an attribute table
  back. The child map (§4b) comes from parsing the built rubric.
* **Do not treat a green suite as coverage.** It reports on the playgrounds that
  exist. The number to watch while this work proceeds is how many blocks have a
  playground at all — 7 of the 22 rubric blocks do today.
* A playground cannot fail for an undocumented CHILD or VALUE either: it exercises
  the snippet an author was given, so anything left out of the doc is equally left
  out of the test. Children and values are checked by the scan or not at all.

## 8 · Legacy documentation — what the cleanup actually is

Asked for after the sections above: the same audit run over the blocks that
pre-date this work. It found one structural thing that matters more than any
individual doc, and three ordinary gaps.

Measured with the app's own extractor (`extractAttributes` over `BLOCK_REGISTRY`,
163 blocks, 116 public) rather than a regex over the sources. The first regex
pass over-reported badly — it missed every attribute declared with a helper like
`z_olx_boolean` instead of `z.`, which is why `Freewrite` appeared to have eight
undocumented attributes it documents perfectly well. **Do not act on the earlier
per-block numbers; act on these.**

### 8a · The hand-written attribute tables are a SECOND IMPLEMENTATION

`lib/docs/schemaUtils.ts:extractAttributes` walks a block's Zod schema and emits
name, type, required, description, **enum values**, and which mixin each
attribute comes from. `docPanels.tsx:AttributesSection` renders that as a table,
grouped into own / base / input / grader. The Overview tab of every block's doc
page shows it, `<DocAttributes>` embeds it beside the Studio cursor, and the MCP
`get_blocks` tool serves the same structure to agents. It cannot drift: the
mixin grouping is derived from the mixin shapes themselves, with a comment
saying so.

**32 `.md` files carry a hand-maintained attribute table anyway. 21 of them are
legacy.** Every one is a copy of something already generated, and the copy is
what rots:

* 39 rows document something that is not an attribute of that block. Some are
  real errors (`Item`'s `ref`, `DefaultGrader`'s `feedback`/`score`,
  `TextSlot`'s `state`/`value`); others are child elements or values, which is
  §4b/§4c's point again, this time in legacy docs.
* 375 schema attributes are absent from the hand tables. That number is NOT a
  defect list — it is almost entirely the base mixin (`class`, `lang`, `draft`,
  `popout`, `launchable`, `print`, `grouped-by`, `initialPosition`, `id`), which
  no hand table should ever have listed. It is the measurement that shows the
  hand table is the wrong instrument rather than a badly-filled one.

**The cleanup: delete the hand-written attribute tables.** Then, per table,
rehome only what the schema cannot carry — a children section (§4b), a values
table where the values belong to something other than an enum attribute, and any
worked prose about how two attributes interact. This replaces "edit 32 tables and
keep editing them forever" with one deletion and a much shorter list of things
that genuinely have to be written by hand.

Where a description is missing, **fix it in the schema, not the doc** — the
generated table renders a blank cell. Nine attributes across six legacy blocks
need a `.describe()`:

| block | attributes with no `.describe()` |
|---|---|
| `FormulaGrader` | `caseSensitive`, `samples`, `tolerance` (3 of its 5) |
| `StringGrader` | `ignoreCase`, `regexp` (both) |
| `NumericalGrader` | `tolerance` |
| `RatioGrader` | `tolerance` |
| `Explanation` | `showWhen` — the same attribute §4c wants the values of |
| `AvatarEditor` | `compact` |

### 8b · 23 public legacy blocks have no README at all

`Annotate`, `AnswerDistribution`, `Cast`, `CastEditor`, `Catalog`,
`CharacterBuilder`, `CompactPopout`, `DocAttributes`, `DocFields`, `Flash`,
`Hint`, `NavigatorDefaultDetail`, `NavigatorDefaultPreview`,
`NavigatorReadingDetail`, `NavigatorTeamDetail`, `NavigatorTeamPreview`,
`RepoCard`, `ShowAnswerButton`, `StateViewer`, `Transcript`, `Trigger`, `Video`,
`VideoPlayer`.

These are not equal in weight and should not be written in list order. `Annotate`,
`CompactPopout`, `StateViewer` and `Flash` are authored surfaces a course writer
reaches for; the five `Navigator*Detail`/`*Preview` blocks are one family and are
one doc, not five; `DocAttributes`/`DocFields` document the doc system itself.

### 8c · 17 public blocks have no example, so no playground

Legacy (11): `Cast`, `Catalog`, `Hint`, the five `Navigator*` blocks, `RepoCard`,
`ShowAnswerButton`, `VideoPlayer`.
New, from this work (6): `DerivedChecks`, `OnChange`, `ScoreTable`,
`SelfMonitorPlot`, `SheetValue`, `SlotSheetGrader` — these six are §2's list and
take priority, being the ones nothing has ever exercised.

### 8d · A question this audit cannot answer alone

**All 22 rubric blocks are `internal: true`**, so the docs browser hides them
unless the reader turns on "show internal". That was right while the rubric was a
generated artifact nobody hand-wrote. It is questionable once the rubric is a
hand-authored OLX component and `Credit`, `Slot` and `Guidance` are the
vocabulary an author types — writing 14 new docs that the browser hides by
default would be most of the work for a fraction of the benefit. Decide the flag
before writing the docs, not after.
