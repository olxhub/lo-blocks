# Item

One rubric entry: everything a scorer needs to judge one thing.

## Attributes

| attribute | meaning |
|---|---|
| `ref` | the content element this entry scores |
| `max` | points available; omit to let the runtime total the slots |
| `conditions` | condition names this item declares, `|`-separated, matched against a frame segment's `when` |
| `params` | values for frame placeholders, as `name=value|name=value` |
| `label` | how this entry is named to a human reader |
| `increment` | the smallest step a score may move by |
| `deriveFromClauses` | build the judging sheet from declared clauses |
| `deriveFromCredit` | build it from the credit components instead — a different sheet, not a synonym |
| `blankCode` | the deduction charged when nothing was answered |
| `expectedType` | the answer this entry looks for, where one is fixed in advance |
| `unreachableCodes` | codes declared here that nothing can charge, comma-separated |

## The item references its content by id

The content's own markup carries no rubric prose. That is the point of the model: a
page can be rewritten without changing what it is scored against, and a rubric can be
retuned without touching the page.

## Names as data

`conditions` and `params` are names the engine matches and substitutes — never
interprets. The generator this model replaced carried a *named boolean per condition*,
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
