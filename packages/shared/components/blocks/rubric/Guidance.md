# Guidance

Judging prose for one item: what a grader is told before answering its checks. It
renders nothing — like every rubric block, it is content other things are
generated *from*.

The most-used child in a real rubric after `<Slot>`: 164 occurrences across 26
items in the course this model was built for.

## The text is the guidance

Whatever stands between the tags is what a grader reads, kept verbatim. The parser
is the RAW one, so leading and trailing whitespace survives — a guidance line is
often spliced next to another and the space between them is part of the text.

## `use` points at shared prose

`use="@name"` takes the body from a `<Frame>` of that name instead of from this
element, so prose that belongs to many items is written once. The `@` is the same
dereference `verdicts="@name"` uses.

```olx:playground
<Vertical id="guidance_demo">
  <Rubric id="guidance_rubric">
    <Frame name="judging">
      <Segment>Answer each check on what the response actually says.</Segment>
    </Frame>
    <Item scores="demo_q" max="2">
      <Guidance>Read the answer literally. Do not supply what it implies.</Guidance>
      <Guidance use="@judging"/>
      <Slot key="k" label="A check" pts="1" verdicts="met|absent">the thing itself</Slot>
    </Item>
  </Rubric>
  <Markdown id="guidance_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## `ifDeclared`

Inside an `<ItemTemplate>`, include this guidance only when the item declares the
named condition; prefix `!` to invert. Consumed by the build, so a reader of
generated content never sees it.

## Related blocks

- **Frame**, **Segment** — the shared prose `use` points at
- **Item** — what guidance belongs to
- **Slot** — the checks the guidance is about
