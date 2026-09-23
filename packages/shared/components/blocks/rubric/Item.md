# Item

One rubric entry: everything a scorer needs to judge one thing.

## Children

An item's attributes say what it is worth and how it is judged; everything it is
judged *on* is a child. Measured on a real rubric of 26 items:

| child | holds | seen |
|---|---|---|
| `<Slot>` | one check on the sheet: what is judged, what it may be answered with, what it is worth | 217 |
| `<Guidance>` | judging prose for this item, shown to whoever grades | 164 |
| `<Credit>` | one credit component: what earns points, and how to judge it | 116 |
| `<Deduction>` | a deduction code, its cost, and the wording it is charged in | 107 |
| `<Context>` | another item whose content this one is judged against | 55 |
| `<Question>` | the question text this entry scores | 26 |
| `<Forbid>` | a combination of verdicts that may not stand together | 7 |
| `<Map>` | a verdict translated into another vocabulary | 6 |
| `<Onlyif>` | a charge that applies only while another check holds | 6 |
| `<Equals>` | two checks required to answer the same way | 6 |
| `<Expect>` | the answer a check is expected to take | 5 |
| `<Counts>` | a check answered with a number rather than a verdict | 4 |
| `<Derived>` | a check computed from others rather than judged | 3 |
| `<Requires>` | a check that only applies once another is satisfied | 3 |
| `<Cover>` | a group of checks judged together for coverage | 2 |
| `<Param>` | a value for a `{placeholder}` in a frame, where the prose is too long for the attribute form | — |

Attributes are documented on the Overview tab, generated from the schema — they
are not repeated here, because a hand-kept copy of a generated table is a second
source that drifts. Two rows of the table that used to stand here were already
wrong when it was removed: it called the content attribute `ref`, and it said
`conditions` is matched against a frame segment's `when`.

## The item references its content by id

The attribute is `scores`, and NOT `ref`: the platform reserves `ref` for `<Use>`
elements and the parser refuses it anywhere else, which `Item.ts` records at the
declaration. The table that used to stand above said `ref`, while the playground
below it used `scores` — so the suite passed while the reference sent an author
into a parser refusal.

The content's own markup carries no rubric prose. That is the point of the model: a
page can be rewritten without changing what it is scored against, and a rubric can be
retuned without touching the page.

## Names as data

`conditions` and `params` are names the engine matches and substitutes — never
interprets. A condition is matched against a segment's **`ifDeclared`**, not its
`when`: `when` is a BASE attribute on every block and already means something else
— an expression gating whether a thing RENDERS — and `Segment.ts` records that
reusing the word would have made one attribute mean two things depending on the
tag it sat on. The generator this model replaced carried a *named boolean per condition*,
which put subject vocabulary into the engine's own interface and meant every new
variant needed engine code.

```olx:playground
<Vertical id="item_demo">
  <Rubric id="item_rubric">
    <Verdicts name="met_absent" values="met|absent"/>
    <Frame name="judging">
      <Segment>Judge it on what is written.</Segment>
      <Segment ifDeclared="timed"> Within one {unit}.</Segment>
    </Frame>
    <Item scores="q1" max="4" conditions="timed" params="unit=week"/>
    <Item scores="q2" max="2"/>
  </Rubric>
  <Markdown id="item_note">Two entries; only the first takes the timed segment.</Markdown>
</Vertical>
```

## Prompt-complete is not scorer-complete

The six attributes below `params` were added after the rubric had already
proved every generated prompt body byte-equal. They are read by the SCORER and
by the audit, never by a prompt, so no amount of byte-equality on the generated
bodies could have said they were missing — and 107 field values were, across
eighteen fields. If you are satisfied a rubric is complete because what it
generates is unchanged, you have checked the prompt and nothing else.

## Keeping it current

An item whose `ref` resolves to nothing scores nothing, and an item declaring a
condition no frame tests is a name that does no work.

## Related blocks

- **Rubric** — the parent
- **Frame**, **Verdicts**, **Deduction** — what an item references
