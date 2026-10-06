# Requires

Credit DENIED unless another check holds. The mirror of `<Onlyif>`, which
suppresses a charge; this withholds credit. Renders nothing.

```olx:playground
<Vertical id="requires_demo">
  <Rubric id="requires_rubric">
    <Item scores="demo_q" max="3">
      <Slot key="names_goal" label="Goal named" pts="1" verdicts="met|absent">a goal is named</Slot>
      <Slot key="goal_measurable" label="Goal measurable" pts="2" verdicts="met|absent">the goal can be measured</Slot>
      <Requires key="goal_measurable" cond="names_goal"/>
    </Item>
  </Rubric>
  <Markdown id="requires_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Onlyif** — the mirror, suppressing a charge rather than withholding credit
