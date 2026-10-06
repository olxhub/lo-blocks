# Deduction

A deduction code, what it costs, and the canonical wording it is charged in.

```
<Deduction code="NO_ANSWER" pts="4">did not answer</Deduction>
```

## Attributes

Generated from the schema and shown on the block's Overview tab — `extractAttributes`
walks the Zod definition and emits every attribute with its type, whether it is
required, its description and its permitted values. A hand-kept copy here would be a
second source of one table, and the copy is what rots.

## The wording travels with the code

A deduction that costs points and says nothing leaves the learner with a lower score
and no account of it. Keeping the text here rather than composing it at the point of
use means every consumer charges the same words, and a reviewer can read what a
learner will be told without running anything.

## `repeatable` is not cosmetic

A charge that can apply more than once, read as applying once, under-charges every
response that earns it twice — silently, because the arithmetic is still internally
consistent.

```olx:playground
<Vertical id="deduction_demo">
  <Rubric id="deduction_rubric">
    <Deduction code="NO_ANSWER" pts="4">did not answer</Deduction>
    <Deduction code="MISSING_ONE" pts="2" repeatable="true">-2 pts: missing one</Deduction>
  </Rubric>
  <Markdown id="deduction_note">One flat charge, one repeatable.</Markdown>
</Vertical>
```

## Keeping it current

A code no rule charges is dead; a rule charging a code that is not declared here has
no wording to charge it in.

## Related blocks

- **Rubric** — the parent
- **Item** — whose rules charge these codes
