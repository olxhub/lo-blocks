# ItemTemplate

A template says *these items are the same shape*. The items say *how they differ*.

```olx:playground
<Vertical id="tpl_demo">
  <Rubric id="tpl_rubric">
    <ItemTemplate name="pair">
      <Slot key="is_generic" verdicts="met|absent" pts="2"/>
      <Slot key="is_{abbrev}" verdicts="met|absent" pts="2"/>
    </ItemTemplate>
    <Item scores="thing_a" use="@pair" max="4" params="abbrev=a"/>
    <Item scores="thing_b" use="@pair" max="4" params="abbrev=b"
          conditions="hasExtra"/>
  </Rubric>
  <Markdown id="tpl_note">Two items, one shape; only `thing_b` declares the
  extra condition.</Markdown>
</Vertical>
```

## Attributes

| attribute | meaning |
|---|---|
| `name` | the name items reference with a leading `@` |

An item opts in with `use="@name"`, and supplies `params` and `conditions`.

## Why this is separate from `Frame`

`Frame` varies **words**. This varies **what the sheet asks**.

Measured on a twelve-item handout built from four helper functions: the item
pairs were 92–100% identical once serialised, yet three of the four differed in
their **slot keys** and one in a **credit key derived from the parameter**. A
prose mechanism cannot reach that. Expanding the items literally instead would
put roughly 86KB of near-duplicate content in the authored source, where one
shared sentence then needs twelve edits.

## Two operations

| operation | written as | the engine knows |
|---|---|---|
| substitution | `{name}`, including **inside attribute values** | a key was asked for and a value supplied |
| conditional child | `ifDeclared="name"`; `!name` inverts | whether the item declared that name |

`key="is_{abbrev}"` is the case that forces substitution into attributes. Filling
only text would attach the right prose to the wrong slot — which scores nothing,
matches nothing, and looks fine.

## Differences live on the item

Not in a list of ids, not in a table keyed by item. An item declares its own
`params` and `conditions`; the template is inert without them. The arrangement
this replaced kept both a helper's argument list *and* module-level tuples naming
which items had which property, and two places to say one thing is two places to
forget.

## Placeholders are not resolved at parse time

The parser keeps `{abbrev}` verbatim. Expansion belongs to the **build**, which
has the item's parameters; a document holding a template does not.

## Expansion is materialised

The build writes **literal items** into generated content, so a reader with its
own parser needs no template grammar at all. The duplication then lives only in
derived output that nobody hand-edits.

## Keeping it current

A template used by one item should be an item. A condition no template tests is
a name doing no work, and a parameter no node asks for is reported rather than
silently ignored.

## Related blocks

- **Item** — declares `use`, `params`, `conditions`
- **Frame** / **Segment** — the same two operations, applied to shared prose
