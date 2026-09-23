# Derived

A check read off the page rather than asked of a model: a field's presence, a word
search, a set of numbers that would plot. Renders nothing.

`kind` says which reading is done and `fields` which inputs it reads.

```olx:playground
<Vertical id="derived_demo">
  <Rubric id="derived_rubric">
    <Item scores="demo_q" max="3">
      <Derived key="wk1_present" kind="present" fields="wk1"/>
      <Derived key="wk2_present" kind="present" fields="wk2"/>
      <Slot key="wk1_present" label="Week 1 entered" pts="1" verdicts="met|absent">the week-1 box holds something</Slot>
      <Slot key="wk2_present" label="Week 2 entered" pts="1" verdicts="met|absent">the week-2 box holds something</Slot>
    </Item>
  </Rubric>
  <Markdown id="derived_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Why this is not a judgement

Whether a box is empty is a fact about the page, and a model asked for it will
sometimes decide it on the meaning of what is there. Reading it directly removes
that.

## Related blocks

- **Counts**, **Cover**, **Equals**, **Expect**, **Map**, **Forbid** — the other computed checks
