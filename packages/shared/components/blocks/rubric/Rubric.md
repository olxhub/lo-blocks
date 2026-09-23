# Rubric

The single source of the judging data a course is scored against. It renders nothing:
a rubric is not something a learner sees, it is content that other things are
generated *from* — prompt bodies, sheet attributes, and whatever a second consumer
derives for itself.

Put it inside the `<Course>` it belongs to. A course holds its rubric without showing
it: the parser keeps non-rendering children out of the navigation, so the learner
never sees a sidebar entry for it.

## Attributes

Generated from the schema and shown on the block's Overview tab — `extractAttributes`
walks the Zod definition and emits every attribute with its type, whether it is
required, its description and its permitted values. A hand-kept copy here would be a
second source of one table, and the copy is what rots.

## Children

| child | holds |
|---|---|
| `<Verdicts>` | a named verdict vocabulary, shared by many slots |
| `<Frame>` | shared prose, assembled from `<Segment>`s |
| `<Deduction>` | a deduction code, its cost, and the wording it is charged in |
| `<Item>` | one rubric entry: a question, its slots, what it is worth |

## A rubric with one of everything

```olx:playground
<Vertical id="rubric_demo">
  <Rubric id="demo_rubric" title="Demonstration rubric">
    <Verdicts name="met_absent" values="met|absent"/>
    <Deduction code="NO_ANSWER" pts="4">did not answer</Deduction>
    <Frame name="judging">
      <Segment>Answer each check on what the response actually says.</Segment>
      <Segment ifDeclared="timed"> Decide it within one {unit}.</Segment>
    </Frame>
    <Item scores="demo_question" max="4" conditions="timed" params="unit=week"/>
  </Rubric>
  <Markdown id="rubric_demo_note">A rubric renders nothing; this note is here so
  the playground has something to show.</Markdown>
</Vertical>
```

## Why it is a content object and not a file

One authoring language, one parser, one place a reviewer looks. A rubric kept as a
separate file needs its own format, its own loader and its own validation, and the
thing most likely to drift — the link between an item and the content it scores — is
exactly what a shared id space already solves.

## Why one source

Two copies of a rule are two rules: they agree until one is edited. Where this rubric
model replaced hand-kept copies, the copies had already drifted in three separate
places before anyone noticed, and each was found by a scoring difference rather than
by reading.

## Keeping it current

Adding a child type means a new block, its own `.md`, and its own tests. A rubric
child that renders anything is a bug: everything here is data.

## Related blocks

- **Course** — holds the rubric without showing it
- **Verdicts**, **Frame**, **Segment**, **Deduction**, **Item** — the children
