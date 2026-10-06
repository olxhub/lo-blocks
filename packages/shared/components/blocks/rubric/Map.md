# Map

A computed check: one pick's value mapped to a named verdict, so a check with more
than one kind of failure is derived rather than asked. Renders nothing.

`pairs` carries the mapping and `fallback` the verdict for anything unmapped, so
an unforeseen value fails visibly instead of silently taking the first branch.

```olx:playground
<Vertical id="map_demo">
  <Rubric id="map_rubric">
    <Item scores="demo_q" max="2">
      <Slot key="chosen" label="What was chosen" pts="1" verdicts="alpha|beta|gamma">which one the answer picks</Slot>
      <Map key="pick_is_right" pick="chosen" pairs="alpha=met,beta=wrong_kind" fallback="absent"/>
    </Item>
  </Rubric>
  <Markdown id="map_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Expect**, **Equals** — the comparison forms of a computed check
