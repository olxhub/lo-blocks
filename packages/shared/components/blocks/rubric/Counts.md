# Counts

A repeated element counted ONCE, its members derived from the number. Renders
nothing.

## Why a count rather than a check each

The model answers HOW MANY; the grader awards that many members. Asking each
member separately invites a different answer to the same question — and measured
on a real corpus it did exactly that, the model naming two and then answering as
though there were six.

`slots` names the members the count stands for.

```olx:playground
<Vertical id="counts_demo">
  <Rubric id="counts_rubric">
    <Item scores="demo_q" max="3">
      <Slot key="reason_1" label="First reason" pts="1" verdicts="met|absent">a reason is given</Slot>
      <Slot key="reason_2" label="Second reason" pts="1" verdicts="met|absent">a second reason is given</Slot>
      <Slot key="reason_3" label="Third reason" pts="1" verdicts="met|absent">a third reason is given</Slot>
      <Counts key="reasons_given" slots="reason_1,reason_2,reason_3"/>
    </Item>
  </Rubric>
  <Markdown id="counts_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Not every repeated family should be counted

A count cannot say WHICH member is missing. Where the members are NAMED rather
than interchangeable — four specific weeks, say — the count loses the very thing
the guidance deducts on, and the family should stay as separate checks.

## Related blocks

- **Cover** — members that must between them cover a set of labels
- **Slot** — the members themselves
