# Param

One value an item supplies to its template, written as an element. Renders
nothing.

## Why both an attribute and an element

`params="abbrev=a|kind=Alpha"` is right for identifiers. It cannot carry prose:
the grammar is delimited by `|` and `=`, and sentences contain both. So a value
too long or too punctuated for the attribute form is written as an element
instead, and the two merge.

A name given twice is an ERROR rather than a silent preference — otherwise an edit
to one of them would do nothing.

```olx:playground
<Vertical id="param_demo">
  <Rubric id="param_rubric">
    <ItemTemplate name="pair">
      <Question>{question}</Question>
      <Slot key="named" label="Names a {kind}" pts="1" verdicts="met|absent">a {kind} is named</Slot>
    </ItemTemplate>
    <Item scores="demo_q" max="1" use="@pair" params="kind=behaviour">
      <Param name="question">Write an example of a behaviour you could change, and say how you would measure it.</Param>
    </Item>
  </Rubric>
  <Markdown id="param_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **ItemTemplate** — what the parameters fill
- **Item** — `params=`, the attribute form
