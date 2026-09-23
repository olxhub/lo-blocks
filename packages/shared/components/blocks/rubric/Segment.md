# Segment

One piece of a `<Frame>`. Segments concatenate in document order.

## Attributes

Generated from the schema and shown on the block's Overview tab — `extractAttributes`
walks the Zod definition and emits every attribute with its type, whether it is
required, its description and its permitted values. A hand-kept copy here would be a
second source of one table, and the copy is what rots.

## Why segments concatenate rather than joining with a separator

Because the case that forced this unit is a sentence spliced **inside** another
sentence. A separator would put a space or a newline where the original has neither,
and the difference is invisible in a diff of rendered prose until it is compared byte
for byte.

```olx:playground
<Vertical id="segment_demo">
  <Rubric id="segment_rubric">
    <Frame name="f">
      <Segment>Always.</Segment>
      <Segment ifDeclared="extra"> Only when declared.</Segment>
      <Segment ifDeclared="!extra"> Only when not.</Segment>
    </Frame>
  </Rubric>
  <Markdown id="segment_note">Three segments, two of them conditional.</Markdown>
</Vertical>
```

## Keeping it current

Leading and trailing spaces inside a segment are significant: they are how a
conditional sentence joins the ones either side of it.

## Related blocks

- **Frame** — the parent
