# Expect

A computed check: an answer compared against a value the rubric names. Renders
nothing.

Not asked of the model: it is arithmetic, not a judgement. Where `<Equals>`
compares two ANSWERS, this compares one answer with a value written in the rubric.

```olx:playground
<Vertical id="expect_demo">
  <Rubric id="expect_rubric">
    <Item scores="demo_q" max="2">
      <Slot key="observed_type" label="Type observed" pts="1" verdicts="PR|NR|PP|NP">which type it actually is</Slot>
      <Expect key="is_the_asked_type" left="observed_type" value="PR"/>
    </Item>
  </Rubric>
  <Markdown id="expect_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Equals** — the two-answer form
