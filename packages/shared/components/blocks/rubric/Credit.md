# Credit

One credit component: what earns points on an item, what it is worth, and how to
judge it. Renders nothing.

## A credit component is not a slot

They are different lines in different documents, and merging them produced prompts
that listed the right components in the wrong order.

- A **`<Slot>`** is a line on the ANSWER SHEET — a question put to whoever grades,
  and the verdict they may answer it with.
- A **`<Credit>`** is a line in the SCORING — a thing the response can earn points
  for.

A slot that carries points is also a credit component, which is why `<Slot>` has
the credit fields too. Where the two lists differ, they differ on purpose.

## The text is the judging description

The body is what a grader is told this component means. RAW, so surrounding
whitespace survives.

```olx:playground
<Vertical id="credit_demo">
  <Rubric id="credit_rubric">
    <Item scores="demo_q" max="3">
      <Credit what="names the behaviour" pts="1" verdicts="met|absent"
              codes="absent=NO_BEHAVIOUR">the response names a behaviour of the student's own</Credit>
      <Credit what="names the consequence" pts="2" verdicts="met|absent|unclear"
              free="unclear">something is added or taken away, and the response says what</Credit>
      <Deduction code="NO_BEHAVIOUR" pts="1">no behaviour is named</Deduction>
    </Item>
  </Rubric>
  <Markdown id="credit_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## `codes` is a mapping, not a list

Which deduction is charged depends on WHICH WAY the component failed: `absent` may
charge one code and `wrong_kind` another. `codes="verdict=CODE,verdict=CODE"` says
that; a flat list of codes could not.

## `free` is declared, never inferred

Verdicts that are not satisfying and still cost nothing. A code keyed on a
counterpart name reads as missing and would forgive a real failure, so this is
written out rather than worked out.

## Related blocks

- **Slot** — the answer-sheet side, and the credit fields it shares
- **Deduction** — the codes `codes` and `charge` name
- **Item** — what a credit component belongs to
