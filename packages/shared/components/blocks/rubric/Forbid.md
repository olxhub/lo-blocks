# Forbid

A computed check that FAILS on a named COMBINATION of other answers. Renders
nothing.

## Why the combination is computed and not asked

Each operand stays its own question, so the model is never asked to report the
combination — it reports the parts, and the check is derived from them and left out
of the response schema. Asking "did both of these happen?" alongside "did this
happen?" invites two different answers to one question.

```olx:playground
<Vertical id="forbid_demo">
  <Rubric id="forbid_rubric">
    <Item scores="demo_q" max="3">
      <Slot key="adds" label="Adds something" pts="1" verdicts="met|absent">something is added</Slot>
      <Slot key="removes" label="Removes something" pts="1" verdicts="met|absent">something is taken away</Slot>
      <Forbid key="both_at_once" conds="adds,removes"/>
    </Item>
  </Rubric>
  <Markdown id="forbid_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Onlyif** — a charge suppressed while a check holds, rather than a combination refused
- **Equals**, **Expect** — the other computed checks
