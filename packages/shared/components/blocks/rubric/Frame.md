# Frame

Shared prose, written once and used by many items. A frame is a list of `<Segment>`s
that concatenate in document order; an item selects which segments it wants and
supplies values for any placeholders they contain.

## Attributes

| attribute | meaning |
|---|---|
| `name` | the name items reference with a leading `@` |

## The unit is a segment, not a clause

This is measured rather than preferred. In the corpus this was designed against, one
numbered clause of a shared frame varies by a **sentence spliced inside it** —
suppressed on the single item where that reading gates the score, because saying it
never changes the score would contradict the guidance there.

A clause-level mechanism cannot express that without storing two copies of the
clause, and two copies of a rule are two rules. A whole clause is just a segment that
happens to be one, so the finer unit costs nothing and covers both cases.

## Selection and substitution

| mechanism | driven by | the engine knows |
|---|---|---|
| selection | `<Segment ifDeclared="name">`, matched against the item's `conditions` | whether the name was declared |
| negation | `cond="!name"` | the same, inverted |
| substitution | `{placeholder}` in a segment, filled from the item's `params` | that a key was asked for and a value given |

It never learns what any of those names *mean*. That is what keeps subject vocabulary
out of the engine.

```olx:playground
<Vertical id="frame_demo">
  <Rubric id="frame_rubric">
    <Frame name="judging">
      <Segment>Answer each check on what the response actually says.</Segment>
      <Segment ifDeclared="!scored"> This never changes the score.</Segment>
      <Segment ifDeclared="timed"> Decide it within one {unit}.</Segment>
    </Frame>
    <Item scores="a" conditions="timed" params="unit=week"/>
    <Item scores="b" conditions="scored"/>
  </Rubric>
  <Markdown id="frame_note">One frame, two items, different prose.</Markdown>
</Vertical>
```

## Keeping it current

A segment whose `when` no item declares is dead prose — it will never render, and
nothing else reports it.

## Related blocks

- **Segment** — the pieces
- **Item** — declares the conditions and parameters that select and fill them
