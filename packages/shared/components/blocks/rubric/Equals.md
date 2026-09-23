# Equals

A computed check: the grader compares two answers it already has. Renders nothing.

Not asked of the model — it is arithmetic over answers, not a judgement, and a
model asked to compare two of its own answers may contradict either.

`lenient` decides whether the comparison forgives differences of form.

```olx:playground
<Vertical id="equals_demo">
  <Rubric id="equals_rubric">
    <Item scores="demo_q" max="3">
      <Slot key="named_type" label="Type named" pts="1" verdicts="PR|NR|PP|NP">which type the answer says it is</Slot>
      <Slot key="observed_type" label="Type observed" pts="1" verdicts="PR|NR|PP|NP">which type it actually is</Slot>
      <Equals key="type_matches" left="named_type" right="observed_type"/>
    </Item>
  </Rubric>
  <Markdown id="equals_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Expect** — comparison against a value the RUBRIC names, rather than another answer
- **Map** — one pick translated into a verdict
