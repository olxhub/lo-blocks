# Verdicts

A named verdict vocabulary, written once and referenced by many slots.

```
<Verdicts name="met_absent_unclear" values="met|absent|unclear"/>
```

A slot then refers to it by name with a leading `@`, rather than repeating the list.

## Attributes

| attribute | meaning |
|---|---|
| `name` | the name slots reference with a leading `@` |
| `values` | the verdicts, `|`-separated, **satisfying one first** |

## Order is not cosmetic

The first value is the satisfying one. It is what a generated checklist renders first
and what a generated sheet attribute emits first, so reordering a vocabulary changes
what the grader is offered — and reordering it in one of two copies changes it for
half the scorers.

## Why shared rather than repeated

Two copies of a vocabulary are two vocabularies. Scorers can default in opposite
directions — one crediting only the satisfying verdict and failing everything else,
another charging only what a deduction code names — so a vocabulary that drifts
between them is scored two ways with nothing saying so.

```olx:playground
<Vertical id="verdicts_demo">
  <Rubric id="verdicts_rubric">
    <Verdicts name="met_absent_unclear" values="met|absent|unclear"/>
    <Verdicts name="yes_no" values="yes|no"/>
  </Rubric>
  <Markdown id="verdicts_note">Two vocabularies, defined once each.</Markdown>
</Vertical>
```

## Keeping it current

A vocabulary nothing references is dead weight; a vocabulary referenced by one slot
is a list that should probably live on the slot.

## Related blocks

- **Rubric** — the parent
- **Item** — whose slots reference these by name
