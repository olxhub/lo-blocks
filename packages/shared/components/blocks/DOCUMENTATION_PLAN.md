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

## 4 · Attribute drift — LEADS, to be confirmed one at a time

A mechanical scan compared each documented block's attribute table against its
`z.object` schema. It reports 17 blocks with differences. **It is a lead
generator, not a verdict list**: several differences are a doc table listing child
ELEMENTS or attribute VALUES rather than attributes, which is not an error.

Confirmed real:

* `Item` — `ref` vs `scores` (above)
* `Slot`, `Deduction` — `ifDeclared` in the schema, absent from the docs
* `SelfMonitorPlot` — 8 schema attributes undocumented: `chartTitle`,
  `chartTitleTarget`, `height`, `width`, `xlabel`, `xlabelTarget`, `ylabel`,
  `ylabelTarget`

Needs confirming before acting (may be false positives of the scan):

* `LLMAction` — `choices`, `free`, `max`, `showChecks`, `slots`, `target`,
  `verdicts` reported undocumented; check whether the doc covers them in prose
  rather than in the table
* `DerivedChecks` — `complete`/`contains`/`plots`/`present` are probably `kind`
  VALUES, not attributes
* `Explanation` — `always`/`answered`/`never` are probably `showWhen` values
* `CapaProblem` — `ChoiceInput`/`LineInput`/… are child elements
* `CodeInput`, `LiquidTemplate`, `OlxSlot`, `SimpleTextSelection`,
  `TextSelectionInput` — `id` is universal and not per-block
* `IntakeGate`, `TimedContainer`, `WordUsage`, `Freewrite` — pre-existing, not
  from this work; record whether each is real before touching it

## 5 · `lib/llm` has two documented modules and several undocumented ones

`materialiseRubric.md` and `itemTemplate.md` exist. `promptAssembler.ts` (327
lines), `promptAssembler.types.ts` (282), `attributeAssembler.ts` (222),
`slotSheet.ts`, `derivedVerdicts.ts` and `runnerGuards.ts` have none. These are
not blocks and carry no playgrounds, so nothing in the suite looks at them at all.

## 6 · Order of work

1. The 14 undocumented rubric blocks, **`Credit` and `Slot` first** — they are
   what an author writes most.
2. `Item.md`'s `ref`/`scores` row, because it is wrong rather than missing.
3. Playgrounds for the four documented-but-unexercised blocks.
4. The confirmed attribute drift.
5. The unconfirmed leads, each verified against the schema before editing.
6. `lib/llm` module docs.

## 7 · How the work is checked

* `npx vitest run docPlaygrounds` — every new playground joins the 209 and must
  parse AND survive the semantic pass. A playground is the test.
* Re-run the attribute-drift scan; it should shrink as rows are fixed and must not
  grow.
* **Do not treat a green suite as coverage.** It reports on the playgrounds that
  exist. The number to watch while this work proceeds is how many blocks have a
  playground at all — 7 of the 22 rubric blocks do today.
