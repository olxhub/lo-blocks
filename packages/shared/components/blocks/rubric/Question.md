# Question

The question as it was put to the learner. Renders nothing.

## Why the rubric holds a copy of the page's words

So a scorer can be shown WHAT WAS ASKED without reading the page, and so the page
can be reworded without changing what it is scored against. The two are allowed to
diverge in wording; what they may not diverge on is meaning, which is why this is
authored beside the checks rather than scraped.

The body is the question text, kept verbatim by the RAW parser.

```olx:playground
<Vertical id="question_demo">
  <Rubric id="question_rubric">
    <Item scores="demo_q" max="2">
      <Question>Describe one behaviour you would like to change, and say why.</Question>
      <Slot key="named" label="Behaviour named" pts="1" verdicts="met|absent">a behaviour is named</Slot>
      <Slot key="why" label="Reason given" pts="1" verdicts="met|absent">a reason is given</Slot>
    </Item>
  </Rubric>
  <Markdown id="question_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Item** — what the question belongs to
- **Guidance** — what the GRADER is told, as against what the learner was asked
