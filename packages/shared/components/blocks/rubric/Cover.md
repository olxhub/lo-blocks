# Cover

Checks that between them must COVER a set of labels — the grader does the pairing
rather than being told which check answers which label. Renders nothing.

Use it where the response may address things in any order: asking "does check 1
cover label A?" forces an order the learner was never given.

```olx:playground
<Vertical id="cover_demo">
  <Rubric id="cover_rubric">
    <Item scores="demo_q" max="2">
      <Slot key="first" label="First thing named" pts="1" verdicts="met|absent">something is named</Slot>
      <Slot key="second" label="Second thing named" pts="1" verdicts="met|absent">a second thing is named</Slot>
      <Cover checks="first,second" labels="antecedent,consequence" verdicts="met|absent"/>
    </Item>
  </Rubric>
  <Markdown id="cover_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Counts** — when only HOW MANY matters, not which
