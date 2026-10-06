# Context

Another item whose answers this one may read, so a grader can judge consistency
between them. Read-only: the referenced answers are shown, never graded here.
Renders nothing.

## Why an item does not just quote the other answer

The answers are the learner's and they change with every submission, so the rubric
names the ITEM and the generator fetches whatever that item actually holds. A
quoted copy would be one learner's words frozen into the rubric.

```olx:playground
<Vertical id="context_demo">
  <Rubric id="context_rubric">
    <Item scores="first_q" max="2">
      <Slot key="named" label="Names one" pts="1" verdicts="met|absent">a thing is named</Slot>
    </Item>
    <Item scores="second_q" max="2">
      <Context item="first_q"/>
      <Guidance>The earlier answer is shown for comparison only; do not re-judge it.</Guidance>
      <Slot key="same" label="Same as before" pts="1" verdicts="met|differs">it names the same thing</Slot>
    </Item>
  </Rubric>
  <Markdown id="context_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Item** — both the owner and the target of `item=`
- **Equals** — when the two answers must MATCH rather than merely be compared
