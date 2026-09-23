# Onlyif

A charge that applies only while another check is satisfied. Renders nothing.

## `cond` here is real data

`cond` names the check this charge depends on. It is NOT the template marker —
that is `ifDeclared`, and the two are deliberately different words because one
attribute cannot mean both "include this element when the item declares X" and
"charge this only while X holds".

```olx:playground
<Vertical id="onlyif_demo">
  <Rubric id="onlyif_rubric">
    <Item scores="demo_q" max="3">
      <Slot key="is_example" label="Is an example" pts="1" verdicts="met|absent">it is an example of the kind asked for</Slot>
      <Slot key="well_aimed" label="Aimed correctly" pts="2" verdicts="met|absent">it is aimed at the right behaviour</Slot>
      <Onlyif key="well_aimed" cond="is_example"/>
    </Item>
  </Rubric>
  <Markdown id="onlyif_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Requires** — the mirror: credit WITHHELD unless another check holds
- **Forbid** — a combination refused outright
