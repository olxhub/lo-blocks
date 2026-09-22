# Bringing block documentation into line with the standard model

Notes from a component-by-component inspection, 2026-09-22. Every number here was
measured against the running system — the block registry through the app's own
`extractAttributes`, the real `parseOLX` over every documented playground, and
the built `bmod_rubric.olx` for the child map. Where an earlier pass in this file
reported something different, the correction is stated rather than silently
replaced.

**The rule for everything below: change only what brings a component into line
with the standard model.** Docs that are merely terse are not defects.

## 1 · The standard model, as the system actually defines it

`docs/README.md` ("Documentation files") states it, and
`packages/shared/scripts/generateBlockRegistry.js` implements it:

| file | role | discovered by |
|---|---|---|
| `X.md` | describes the block; may embed live examples | exact name match → `readme` |
| `X.olx` | the **minimal** example — "as many features as possible, as concisely as possible" | prefix match; fallback for BOTH `template` and `demo` |
| `X*.olx`, `X*.xml` | further examples: other contexts, advanced use | prefix match |
| `X.template.olx` | overrides the editor insert template | exact |
| `X.demo.olx` | overrides the docs marquee example | exact |
| `X*.includes.olx` | shared fixtures reused via `<Use ref>` — synced, NOT run as examples | exact suffix |

Two more parts of the model are not in that README but are just as binding:

* **Attributes are GENERATED, not written.** `lib/docs/schemaUtils.ts:extractAttributes`
  walks the block's Zod schema and emits name, type, required, description, enum
  values and which mixin each attribute comes from;
  `BlockDoc/docPanels.tsx:AttributesSection` renders it on the Overview tab,
  `<DocAttributes>` embeds it beside the Studio cursor, and the MCP `get_blocks`
  tool serves the same structure to agents. **The `.describe()` string in the
  schema is the attribute's documentation.** A hand-written attribute table in a
  `.md` is a second copy of a generated artefact.
* **Examples are executable documentation.** `OLXCodeBlock` supports
  ` ```olx:code `, ` ```olx:render ` and ` ```olx:playground `; a playground is
  wrapped in a `<Vertical>` and run through the real parser. Across all block
  docs: 206 playgrounds, 91 `olx:code`, 1 `olx:render`.

### The resulting per-component checklist

- **a** — `X.md` exists and describes the block
- **b** — `X.olx` exists (the minimal example, and therefore the editor template)
- **c** — every playground parses **and the parse reports no errors** (see §3)
- **d** — no hand-written attribute table (§2)
- **e** — children are documented where the block takes children
- **f** — every own attribute has a `.describe()`, so the generated table has no
  blank cell

## 2 · The correction that shrinks most of this work

**Delete the hand-written attribute tables.** 32 `.md` files carry one, 21 of them
legacy. Each duplicates the generated table, and duplication is the whole reason
this drift exists.

**Correcting an earlier count in this file:** a previous pass reported "39 rows
document something that is not an attribute". That was my parser mistaking the
header rows of *other* tables (Children, Modes, Syntax) for attribute rows. Scanned
properly, against the registry, the true figure is **6 rows across 3 blocks**, and
all six are named in §5. The earlier per-block numbers from the regex pass — which
also missed every attribute declared with a helper like `z_olx_boolean`, and so
invented eight findings against `Freewrite` — should not be acted on.

The other number that pass produced, "375 schema attributes missing from the hand
tables", is not a defect list either. It is almost entirely the base mixin —
`class`, `lang`, `draft`, `popout`, `launchable`, `print`, `grouped-by`,
`initialPosition`, `id` — which no hand table should ever have listed. It measures
the instrument, not the docs.

`Rubric.md` is the clean illustration: its table has two rows, `id` and `title`,
and **`Rubric` has no own attributes at all** — both are base-mixin, and the
generated table already groups them under "Base attributes (all blocks)".

What to keep when a table goes: anything the schema cannot carry — a **Children**
table (§4), a table of values belonging to something other than an enum attribute,
and prose about how two attributes interact.

## 3 · A gap in the test, and three playgrounds the engine rejects

`docPlaygrounds.test.ts` asserts that `parseOLX(...)` **resolves truthy**. It does
not assert that the parse reported no errors. Running the same 206 playgrounds and
reading `result.errors` finds three the engine rejects outright:

| doc | error | what is actually wrong |
|---|---|---|
| `DefaultGrader.md` #1 | `Unrecognized key(s) in object: 'score', 'feedback'` | `score`/`feedback` are `RULE_ATTRIBUTES` (`createGrader.ts:56`) and belong on `DefaultMatch` **inside** `RulesGrader` — which this doc's own second playground shows correctly. `DefaultGrader` declares `attributes: {}`. |
| `LineInput.md` #3 | `Unrecognized key(s) in object: 'caseInsensitive'` | the attribute is `ignoreCase`. A wrong name, nothing more. |
| `MatchingGrader.md` #2 | `label: Required` | `<ActionButton target="...">Check Answer</ActionButton>` passes the text as a child; `label` is a required attribute — `label="Check Answer"`. |

**The fix that matters is the assertion**, not the three snippets: change the
suite to require an empty `errors` array. That converts the doc suite from "it
parses" to "the engine accepts it", and it is the single highest-value change in
this review — all three defects are worked examples a reader would copy.

One caveat to record with it: 6 `CustomGrader` playgrounds cannot be validated in
that harness at all — they fail with `Config not initialized. Call initConfig()
first.` Either the suite's setup gains `initConfig()` or those six stay unchecked,
and saying which is part of the change.

## 4 · Children, which the schema does not carry

Measured on the built `bmod_rubric.olx`:

```
Rubric  -> Item x26, Verdicts x5, Frame x2
Item    -> Slot x217, Guidance x164, Credit x116, Deduction x107, Context x55,
           Question x26, Forbid x7, Map x6, Onlyif x6, Equals x6, Expect x5,
           Counts x4, Derived x3, Requires x3, Cover x2
Frame   -> Segment x4
```

`Rubric.md` already has a Children table and is the model to copy. `Item.md` has
none, and that is the largest single gap in the rubric reference: an author
reading it learns the element's attributes and nothing about the fifteen kinds of
thing that go inside it, which is where all the content lives.

## 5 · `internal: true` comes off the rubric blocks — and what that requires

Decided 2026-09-22: rubric elements are author-facing, so they must not be
`internal`. `lib/types/core.ts` agrees with that reading — it defines `internal`
as "hidden from the main documentation navigation … not intended for direct use
by course authors", which is exactly what a hand-authored rubric is not.

**But one other thing reads the flag, and it is load-bearing.**
`layout/Course/_Course.tsx:87` filters a course's children with
`!BLOCK_REGISTRY[k?.tag]?.internal` so that a course can hold its rubric without
showing the learner a sidebar entry for it. Clearing `internal` without replacing
that predicate puts the rubric into the course navigation.

The comment there already names the right predicate — "every non-rendering block
is covered" — but `internal` is not that predicate: **25 internal blocks do
render** (`Html`, `Spinner`, `Sidebar`, `StringMatch`, `Studio` …). The registry
carries the real signal: a blueprint has `component` (eager) or `componentLoader`
(lazy), and a block with neither renders nothing.

Measured over the registry: **the 22 blocks with neither are exactly the 22 rubric
blocks.** So swapping the filter to `!(component || componentLoader)` hides the
same set today, survives the flag change, and makes the code match what
`Rubric.md` already tells readers ("a course holds its rubric without showing
it … non-rendering children stay out of the navigation").

Order matters: **swap the predicate first, clear `internal` second.** Between
those two edits the rubric would render in the course.

## 6 · Component-by-component

### 6.1 The rubric family (22 blocks)

Once `internal` comes off, every one of these owes the full standard model. None
of the 22 has an `X.olx`, so **none has an editor insert template** — which for a
hand-authored rubric is the thing an author reaches for first.

They cannot be used in isolation: a `<Slot>` needs an `<Item>` needs a `<Rubric>`.
`docs/README.md` anticipates exactly this case — "helpful mostly for blocks which
can't be used in isolation (e.g. `<Key>` and `<Distractor>` need to be in the
context of an MCQ)" — and `X.template.olx` is implemented, so the mechanism is
already there. A shared `Rubric.includes.olx` fixture pulled in with `<Use ref>`
is the other half.

A playground for a non-rendering block has an established answer in this repo, in
`Rubric.md`: show the element in context and add a `<Markdown>` note so the
preview has something to show.

**Documented already (8) — needs: attribute table deleted, `X.olx` written**

| block | notes beyond the two common items |
|---|---|
| `Rubric` | The exemplar: Children table, a one-of-everything playground, "why one source" prose. Its attribute table documents `id`/`title`, which are base-mixin — Rubric has no own attributes. Delete the table and nothing is lost. |
| `Item` | Table says `ref`; the attribute is `scores`, and `Item.ts` records why — "the platform reserves `ref` for `<Use>` elements and the parser refuses it anywhere else". The same table's `conditions` row says the name is "matched against a frame segment's `when`" — it is matched against `ifDeclared`, and `Segment.ts` records why it is deliberately NOT `when` ("a BASE attribute that gates RENDERING by expression … reusing the word would have made one attribute mean two things"). The table also omits `use`. Deleting it fixes all three. Then **add the Children table (§4)** — 15 element types, the biggest gap in the family. |
| `Slot` | 14 own attributes, the most-used element in a rubric, and **no playground and no example — nothing runnable anywhere**. Highest priority for `Slot.olx`. Its prose sections (`A gate that charges`, `Why charge is not codes`) are good and stay. |
| `Deduction` | `ifDeclared` missing from the table; deleting the table settles it. Prose on `repeatable` and on wording travelling with the code stays. |
| `Verdicts` | Table → delete. "Order is not cosmetic" is exactly the kind of prose the generated table cannot carry; keep. |
| `Frame` | Table → delete. Keep "the unit is a segment, not a clause". |
| `Segment` | Table → delete (one own attribute, `ifDeclared`). Keep the concatenation rationale. |
| `ItemTemplate` | Table → delete. Keep "why this is separate from `Frame`" and the two-operations section. |

**Undocumented (14) — need `X.md` and `X.olx` from nothing**

`Credit`, `Guidance`, `Question`, `Context`, `Counts`, `Cover`, `Equals`,
`Expect`, `Forbid`, `Map`, `Onlyif`, `Requires`, `Derived`, `Param`.

Write them in corpus-frequency order — `Guidance` (164 uses), `Credit` (116),
`Context` (55), `Question` (26), then the rest, which appear 2–7 times each. Seven
of these carry a **text body** (`Credit`, `Guidance`, `Question`, `Param`, plus
`Slot`, `Deduction`, `Segment` above), and the body's meaning is per-block — for
`Slot` it is the judging description shown to the grader, distinct from `label`,
which is what the learner sees. An attribute table cannot carry that distinction
and a reader cannot guess it, so each doc must say what its body is.

`Credit` also needs the distinction its own source records — a slot is a line on
the answer sheet, a credit component is a line in the scoring — because merging
the two produced prompts that listed the right components in the wrong order.

### 6.2 Changed non-rubric blocks

| block | state | what alignment needs |
|---|---|---|
| `ActionButton` | md, 5 examples, template, 4 playgrounds | Compliant. Delete the attribute table only. |
| `Chat` | md, 6 examples, template, 2 playgrounds | Delete the table (its rows `fullscreen`/`window` are `popout` VALUES, not attributes). Keep the CDATA note — playground #2 is the regression case for `sidebar <- summary`. |
| `Collapsible`, `NumberInput`, `Sequential`, `UseHistory`, `LLMFeedback` | md + template + playgrounds | Compliant. Table deletion only. |
| `LLMAction` | md, 1 example, template, 3 playgrounds, 28 attributes | Table deletion. Its rows `absent`/`met`/`unclear` are verdict VALUES — if they need documenting they belong in a values section, not the attribute table. |
| `Course` | md, 1 example, template, 0 playgrounds | Compliant — the model requires an example, not a playground. **Its prose must change with §5**: it should describe the non-rendering rule, not `internal`. |
| `PrintAction` | md, 1 example, template, 0 playgrounds | Compliant. No change. |
| `DerivedChecks` | md, 1 playground, **no example** | Needs `DerivedChecks.olx`. Its `complete`/`contains`/`plots`/`present` rows are `kind` values → a values section. |
| `SheetValue` | md, 1 playground, **no example** | Needs `SheetValue.olx`. |
| `ScoreTable` | md, 1 playground, **no example** | Needs `ScoreTable.olx`. |
| `SlotSheetGrader` | md, 3 playgrounds, **no example** | Needs `SlotSheetGrader.olx`. Its presence claim is already asserted in the suite — the one place a doc's *prose* is tested. |
| `OnChange` | md, **no example, no playground** | Needs `OnChange.olx`. |
| `SelfMonitorPlot` | md, **no example, no playground**, 24 attributes | Needs `SelfMonitorPlot.olx`. Eight attributes are absent from its table (`chartTitle`, `chartTitleTarget`, `height`, `width`, `xlabel`, `xlabelTarget`, `ylabel`, `ylabelTarget`) — deleting the table settles it, provided each has a `.describe()`. |

### 6.3 Legacy blocks with a real defect

| block | defect | fix |
|---|---|---|
| `DefaultGrader` | Documents `score`/`feedback` as its attributes, and playground #1 uses them; the engine rejects both (§3). `DefaultGrader.ts:6`'s header comment shows the same wrong usage. | Fix the playground, delete the table, fix the source comment. Three places, one error. |
| `LineInput` | Playground #3 writes `caseInsensitive` for `ignoreCase` (§3). | One word. |
| `MatchingGrader` | Playground #2 omits the required `label` on `<ActionButton>` (§3). | One attribute. |
| `RulesGrader` | Table lists `score`/`feedback`/`feedbackBlock` — these ARE real, but on the `*Match` rules, not on `RulesGrader`. It also lists `DefaultMatch`/`NumericalMatch`/`RatioMatch`/`StringMatch`, which are children. | Delete the table; keep a Children table and a rule-attributes section, since that is genuinely where those three live. |
| `FormulaGrader`, `StringGrader`, `NumericalGrader`, `RatioGrader`, `Explanation`, `AvatarEditor` | 9 own attributes have no `.describe()`, so the generated table renders a blank cell: `caseSensitive`/`samples`/`tolerance`, `ignoreCase`/`regexp`, `tolerance`, `tolerance`, `showWhen`, `compact`. | Add `.describe()` **in the schema**. This is the only class of doc fix that is a code edit. |

### 6.4 Legacy blocks with no `X.md` (23)

Not equal in weight, and not to be written in alphabetical order:

* **Author-facing surfaces, first**: `Annotate`, `CompactPopout`, `StateViewer`,
  `Flash`, `Hint`, `Transcript`, `Video`, `VideoPlayer`, `ShowAnswerButton`.
* **One family, one doc — not five**: `NavigatorDefaultDetail`,
  `NavigatorDefaultPreview`, `NavigatorReadingDetail`, `NavigatorTeamDetail`,
  `NavigatorTeamPreview`. Writing five near-identical files would satisfy a
  counter and help nobody.
* **The doc system documenting itself**: `DocAttributes`, `DocFields` — small,
  and worth doing because they are how everything else is read.
* **Casting/authoring**: `Cast`, `CastEditor`, `CharacterBuilder`, `Catalog`,
  `RepoCard`, `AnswerDistribution`, `Trigger`.

11 of these also have no example: `Cast`, `Catalog`, `Hint`, the five
`Navigator*`, `RepoCard`, `ShowAnswerButton`, `VideoPlayer`.

## 7 · Order of work

1. **Strengthen the playground assertion to require no parse errors** (§3), and
   decide the `CustomGrader`/`initConfig` question. Everything after this is
   checked by it.
2. Fix the three rejected playgrounds (§3) plus the `DefaultGrader.ts` comment.
3. **`_Course.tsx`: swap `internal` for `!(component || componentLoader)`** (§5).
4. **Clear `internal: true` from the 22 rubric blocks** — after step 3, never before.
5. Delete the 32 hand-written attribute tables (§2), rehoming per table only what
   the schema cannot carry.
6. `Item.md`'s Children table (§4).
7. The 9 missing `.describe()` calls (§6.3) — in the schema.
8. `X.olx` for the six changed blocks that lack one, then for the rubric family
   (`Slot` first), using `X.template.olx` and a shared `Rubric.includes.olx`.
9. The 14 undocumented rubric blocks, in corpus-frequency order (§6.1).
10. The 23 legacy `.md` files, family-grouped (§6.4).
11. `lib/llm`'s undocumented modules.

## 8 · How this is checked

* `npx vitest run docPlaygrounds` — with §3's stronger assertion, a playground is
  a real test of the snippet.
* **Commit the audit** rather than re-deriving it. It must read the registry
  through `extractAttributes`, not a regex over the sources — the regex pass
  produced false findings against `Freewrite`, `Rubric` and a dozen others, and
  two rounds of this plan were written from them. It should report, per block:
  no `.md`, no `X.olx`, an own attribute with no `.describe()`, and a `.md` that
  has grown an attribute table back.
* **A green suite is not coverage.** It reports on the playgrounds that exist, and
  a missing child, value or whole document is exactly what it cannot see.
